'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Users, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { AdRule, AdsDTO, AssetVariant, PredicateRule } from '@/lib/types';
import { Button, Input, Modal, Select, useToast } from './ui';
import { RuleBuilder } from './RuleBuilder';
import { WidgetEditor } from './WidgetEditor';
import { parseTiles } from './TileGrid';
import { BLOCK_PRIORITY, activeBlock, isBlockRule, isCustomRule, nextCustomPriority } from '@/lib/rules';
import { friendlyName } from '@/lib/names';

interface Creative { imageUrl: string; adType: string; action: string; url: string; text: string; height: string; customWidgetData: string }
const EMPTY_CREATIVE: Creative = { imageUrl: '', adType: '', action: '', url: '', text: '', height: '', customWidgetData: '' };

/**
 * The one editor for a slot's ad: creative + who sees it + what everyone else sees.
 *
 * Saving produces: a variant (when creative fields are overridden), a predicate (when conditions are set),
 * one custom ad_rule above the production passthrough, and (optionally) a BLOCK rule at priority 995 so
 * non-matching users see NOTHING instead of the production default — that's what makes conditions
 * actually restrict an ad instead of silently falling back to the same creative.
 */
export function AdEditor({ module, location, chain, rule, prefill, assets, variants, predicates, engineOn, onClose, onSaved }: {
  module: string;                  // the ad module this slot belongs to (EXPLORE / TRADECARD)
  location: string;
  chain: AdRule[];                 // this location's full rule chain (priority asc)
  rule: AdRule | null;             // custom rule being edited, or null = add new
  prefill?: AdsDTO | null;         // creative the app serves right now (start-from values)
  assets: AdsDTO[];
  variants: AssetVariant[];
  predicates: PredicateRule[];
  engineOn: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const existingVariant = rule?.variantId != null ? variants.find((v) => v.id === rule.variantId) : undefined;
  const initialExpr = rule?.ruleId != null ? (predicates.find((p) => p.id === rule.ruleId)?.expr ?? '') : '';

  const [expr, setExpr] = useState(initialExpr);
  const [othersSee, setOthersSee] = useState<'default' | 'nothing'>(activeBlock(chain) ? 'nothing' : 'default');
  const [baseAdId, setBaseAdId] = useState<number | null>(existingVariant?.baseAdsId ?? rule?.adsId ?? prefill?.id ?? null);
  const [c, setC] = useState<Creative>(existingVariant ? {
    imageUrl: existingVariant.imageUrl ?? '', adType: existingVariant.adType ?? '', action: existingVariant.action ?? '',
    url: existingVariant.url ?? '', text: existingVariant.text ?? '', height: existingVariant.height != null ? String(existingVariant.height) : '',
    customWidgetData: existingVariant.customWidgetData ?? '',
  } : prefill ? {
    imageUrl: prefill.imageURL ?? '', adType: prefill.adType ?? '', action: prefill.action ?? '',
    url: prefill.url ?? '', text: prefill.text ?? '', height: prefill.height != null ? String(prefill.height) : '',
    customWidgetData: prefill.customWidgetData ?? '',
  } : EMPTY_CREATIVE);

  const setField = (k: keyof Creative, v: string) => setC((p) => ({ ...p, [k]: v }));
  const baseAd = baseAdId != null ? assetById.get(baseAdId) : undefined;
  const assetOptions = [...assets].sort((a, b) => (a.location === location ? -1 : 0) - (b.location === location ? -1 : 0));
  const hasOverrides = Object.values(c).some((v) => v.trim() !== '');
  // tile menus / widgets carry their visuals inside customWidgetData — surface the first tile as the thumbnail
  const tilesThumb = parseTiles(c.customWidgetData || prefill?.customWidgetData || null)?.[0]?.asset?.url;
  const previewImg = c.imageUrl || baseAd?.imageURL || tilesThumb;
  const hasConditions = !!expr.trim();

  const save = useMutation({
    mutationFn: async () => {
      // 1) Conditions → predicate row. `active: true` is REQUIRED: the backend Row uses a primitive
      // boolean, so omitting it stores is_active=false — and an inactive predicate is invisible to the
      // resolver, which treats the rule as "no conditions" (matches everyone).
      let ruleId = rule?.ruleId ?? null;
      if (expr.trim()) {
        if (ruleId) await api.updatePredicate(ruleId, { id: ruleId, ruleKey: `auto_${location}_${ruleId}`, expr, active: true });
        else ruleId = (await api.createPredicate({ ruleKey: `auto_${location}_${Date.now()}`, expr, description: `Conditions for ${location}`, active: true })).id;
      } else {
        ruleId = null;
      }

      // 2) Creative → variant (when overridden) or pinned base ad
      let adsId: number | null = null;
      let variantId: number | null = null;
      if (hasOverrides) {
        const v: AssetVariant = {
          variantKey: existingVariant?.variantKey ?? `var_${location}_${Date.now()}`,
          baseAdsId: baseAdId, module, location,
          imageUrl: c.imageUrl || null, adType: c.adType || null, action: c.action || null,
          url: c.url || null, text: c.text || null, height: c.height ? Number(c.height) : null,
          customWidgetData: c.customWidgetData || null, active: true,
        };
        if (existingVariant?.id) { await api.updateVariant(existingVariant.id, { ...v, id: existingVariant.id }); variantId = existingVariant.id; }
        else variantId = (await api.createVariant(v)).id;
      } else {
        adsId = baseAdId;
      }

      // 3) The custom rule itself — always ABOVE the production passthrough
      if (rule?.id && isCustomRule(rule)) {
        await api.updateRule(rule.id, { ...rule, ruleId, adsId, variantId });
      } else {
        await api.createRule({
          module, location, adsId, variantId, ruleId,
          priority: nextCustomPriority(chain), active: true, visible: true,
        });
      }

      // 4) What non-matching users see: production default vs nothing (BLOCK rule at 995)
      const existingBlock = chain.find(isBlockRule);
      if (hasConditions && othersSee === 'nothing') {
        if (existingBlock?.id) {
          if (!existingBlock.active) await api.updateRule(existingBlock.id, { ...existingBlock, active: true });
        } else {
          await api.createRule({ module, location, adsId: null, variantId: null, ruleId: null, priority: BLOCK_PRIORITY, active: true, visible: false });
        }
      } else if (existingBlock?.id && existingBlock.active) {
        await api.updateRule(existingBlock.id, { ...existingBlock, active: false });
      }
    },
    onSuccess: () => {
      toast('success', engineOn ? 'Saved — live in the app now' : 'Saved — will apply once you Go Live');
      onSaved();
    },
    onError: (e) => toast('error', (e as Error).message),
  });

  return (
    <Modal open onClose={onClose} title={`${rule ? 'Edit ad' : 'New ad'} · ${friendlyName(location)}`} wide>
      <div className="space-y-4">
        {/* Creative */}
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">What it looks like</p>
          <div className="flex gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {previewImg ? <img src={previewImg} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-300">preview</div>}
            </div>
            <div className="flex-1">
              <Select label="Start from an existing ad (optional)" value={String(baseAdId ?? '')} onChange={(v) => setBaseAdId(v ? Number(v) : null)}
                options={[{ value: '', label: '— start blank —' }, ...assetOptions.map((a) => ({ value: String(a.id), label: `${friendlyName(a.location)} · ${a.adType ?? 'banner'} (#${a.id})` }))]} />
              <p className="mt-1 text-[11px] text-slate-400">Leave a field empty to keep it as-is from the ad you started from. Fill it to change it.</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Input label="Image" value={c.imageUrl} onChange={(e) => setField('imageUrl', e.target.value)} placeholder={baseAd?.imageURL ?? 'https://… (image link)'} />
            <Input label="Where it opens when tapped" value={c.url} onChange={(e) => setField('url', e.target.value)} placeholder={baseAd?.url ?? 'link or screen'} />
            <Input label="Text on the ad" value={c.text} onChange={(e) => setField('text', e.target.value)} placeholder={baseAd?.text ?? ''} />
            <Input label="Height (px)" type="number" value={c.height} onChange={(e) => setField('height', e.target.value)} placeholder={baseAd?.height != null ? String(baseAd.height) : ''} />
          </div>

          <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-slate-500">Advanced (developer settings)</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input label="Action" value={c.action} onChange={(e) => setField('action', e.target.value)} placeholder={baseAd?.action ?? 'WEBVIEW / PRO / …'} />
              <Input label="Ad type" value={c.adType} onChange={(e) => setField('adType', e.target.value)} placeholder={baseAd?.adType ?? ''} />
            </div>
          </details>

          {(c.customWidgetData || prefill?.customWidgetData) && (
            <div className="mt-3">
              <WidgetEditor value={c.customWidgetData} onChange={(v) => setField('customWidgetData', v)} />
            </div>
          )}
        </div>

        {/* Who sees it */}
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Who sees this ad</p>
          <RuleBuilder expr={expr} onChange={setExpr} />

          {hasConditions && (
            <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
              <p className="mb-2 text-xs font-medium text-slate-600">Users who <b>don&apos;t</b> match see:</p>
              <div className="flex gap-2">
                <ChoiceChip icon={<Users className="h-3.5 w-3.5" />} active={othersSee === 'default'} onClick={() => setOthersSee('default')}
                  title="Production default" sub="whatever the app shows today" />
                <ChoiceChip icon={<EyeOff className="h-3.5 w-3.5" />} active={othersSee === 'nothing'} onClick={() => setOthersSee('nothing')}
                  title="Nothing" sub="this slot stays empty for them" />
              </div>
            </div>
          )}
        </div>

        {!engineOn && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The engine is <b>paused</b> — this will be saved as a draft and applies the moment you press <b>Go Live</b> at the top.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || (baseAdId == null && !hasOverrides)}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChoiceChip({ icon, title, sub, active, onClick }: {
  icon: React.ReactNode; title: string; sub: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={clsx('flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition',
        active ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:border-slate-300')}>
      <span className={active ? 'text-brand-600' : 'text-slate-400'}>{icon}</span>
      <span>
        <span className={clsx('block text-xs font-semibold', active ? 'text-brand-700' : 'text-slate-700')}>{title}</span>
        <span className="block text-[10px] text-slate-400">{sub}</span>
      </span>
    </button>
  );
}
