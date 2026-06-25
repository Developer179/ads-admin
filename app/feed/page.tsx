'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Smartphone, Eye, EyeOff, Pencil, Plus, GripVertical, Rocket, Pause,
  ChevronDown, ChevronUp, Trash2, Undo2, Megaphone, UserRound, Home, Wallet, Lightbulb, Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import { AdRule, AdsDTO, AssetVariant, LayoutSlot, PredicateRule, TraceDecision } from '@/lib/types';
import { Badge, Button, Card, ConfirmDialog, Input, Toggle, useToast } from '@/components/ui';
import { TileGrid, parseTiles } from '@/components/TileGrid';
import { AdEditor } from '@/components/AdEditor';
import { parseWidgetImages } from '@/lib/widget';
import { useSampleUser } from '@/lib/sampleUser';
import { useModule, MODULES, MODULE_GROUPS, subTabsFor, allTabLocations, NAV_TABS } from '@/lib/modules';
import type { ModuleKey, Audience } from '@/lib/modules';
import { ruleSummary } from '@/lib/dsl';
import { KILL_PRIORITY, activeKill, chainFor, customRules, isCustomRule, isKillRule } from '@/lib/rules';
import { friendlyHint, friendlyName, isSentinel } from '@/lib/names';
import { PreviewResult } from '@/lib/types';

/**
 * LIVE APP VIEW — the one place to control everything the app shows on EXPLORE.
 * The feed renders exactly what a sample user receives, in the app's visual order. Every slot has its
 * controls right on the card: show/hide, edit creative, conditions, add ad, revert to production,
 * drag to reorder. A loud banner makes the engine state impossible to miss.
 */
export default function FeedPage() {
  const [sampleUser, setSampleUser] = useSampleUser();
  const [mod, setMod] = useModule();
  const M = MODULES[mod];
  const qc = useQueryClient();
  const toast = useToast();

  // active sub-tab within a tabbed module (Trade Board); '' resolves to the first sub-tab
  const [activeTab, setActiveTab] = useState<string>('');

  const previewQ = useQuery({
    queryKey: ['preview', mod, sampleUser],
    queryFn: () => api.preview(Number(sampleUser), mod),
    enabled: !!sampleUser,
  });
  const rulesQ = useQuery({ queryKey: ['rules', mod, true], queryFn: () => api.listRules(mod, true) });
  const layoutQ = useQuery({ queryKey: ['layout', mod, true], queryFn: () => api.listLayout(mod, true) });
  const togglesQ = useQuery({ queryKey: ['toggles'], queryFn: () => api.listToggles() });
  const assetsQ = useQuery({ queryKey: ['assets', mod], queryFn: () => api.listAssets(mod) });
  const variantsQ = useQuery({ queryKey: ['variants'], queryFn: () => api.listVariants(false) });
  const predicatesQ = useQuery({ queryKey: ['predicates'], queryFn: () => api.listPredicates(false) });
  const schemaQ = useQuery({ queryKey: ['schema'], queryFn: () => api.schema() });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['preview'] });
    qc.invalidateQueries({ queryKey: ['rules'] });
    qc.invalidateQueries({ queryKey: ['layout'] });
    qc.invalidateQueries({ queryKey: ['predicates'] });
    qc.invalidateQueries({ queryKey: ['variants'] });
    qc.invalidateQueries({ queryKey: ['toggles'] });
  };

  const r = previewQ.data;
  const rules = rulesQ.data ?? [];
  const traceByLocation = useMemo(() => new Map((r?.trace ?? []).map((t) => [t.location, t])), [r]);
  const servedByLocation = useMemo(() => {
    const m = new Map<string, AdsDTO[]>();
    for (const ad of r?.served ?? []) {
      // suffix-killed legacy ads (location ends in "...XXX") match no app widget — never show them in preview
      if (ad.location && !ad.location.endsWith('XXX')) m.set(ad.location, [...(m.get(ad.location) ?? []), ad]);
    }
    return m;
  }, [r]);

  // ---- tabbed modules: the real Trade Board shows different sub-tabs to paid vs unpaid viewers ----
  const audience: Audience = r?.isPaid ? 'paid' : 'unpaid';
  // Commodity is a conditional tab in the app (paid: tradeCardSequence contains COMMODITY; unpaid:
  // commodityEnabled). Approximate from the live preview: show it only when a commodity ad is actually
  // served/traced for this user, so the admin's tab set matches the user's real Trade Board.
  const subTabs = useMemo(() => subTabsFor(M, audience).filter((t) =>
    t.id !== 'commodity' || t.locations.some((loc) => servedByLocation.has(loc) || traceByLocation.has(loc)),
  ), [M, audience, servedByLocation, traceByLocation]);
  const activeSub = subTabs.find((t) => t.id === activeTab) ?? subTabs[0];
  // reset to the first sub-tab when the screen (module) or persona (paid/unpaid) changes
  useEffect(() => { setActiveTab(subTabs[0]?.id ?? ''); }, [mod, audience]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- engine state (the master switch the app's feed request actually resolves: <module> @ *) ----
  const wildcard = (togglesQ.data ?? []).find((t) => t.adType === mod && t.location === '*');
  const engineOn = wildcard?.engineOn ?? r?.engineOn ?? false;
  const layoutToggle = (togglesQ.data ?? []).find((t) => t.adType === M.layoutKey && t.location === '*');
  const [confirmLive, setConfirmLive] = useState<'on' | 'off' | null>(null);
  const setEngine = useMutation({
    mutationFn: (on: boolean) => api.setToggle({
      adType: mod, location: '*', engineOn: on,
      shadowSamplePercent: wildcard?.shadowSamplePercent ?? 0, id: wildcard?.id,
    }),
    onSuccess: (_d, on) => {
      setConfirmLive(null);
      refreshAll();
      toast('success', on ? '🚀 LIVE — the app now serves your rules' : 'Paused — the app is back on production logic');
    },
    onError: (e) => toast('error', (e as Error).message),
  });

  // ---- visual order (drag & drop) ----
  // EXPLORE drives order from the app's single scroll (HomeScreenWidgetOrder). Tabbed modules (Trade Board)
  // drive it from the active tab's slots (sorted by persisted slot_order, else declared order). Both feed the
  // SAME draggable card list below — the only on-screen difference is the trade navbar.
  const widgetOrder = useMemo(() => Array.from(new Set(r?.widgetOrder ?? [])), [r]);
  const tabOrder = useMemo(() => {
    if (M.usesWidgetOrder) return [] as string[];
    const locs = activeSub?.locations ?? [];
    const slotByLoc = new Map((layoutQ.data ?? []).map((s) => [s.location, s] as const));
    return [...locs].sort((a, b) => {
      const sa = slotByLoc.get(a)?.slotOrder ?? (locs.indexOf(a) + 1) * 10;
      const sb = slotByLoc.get(b)?.slotOrder ?? (locs.indexOf(b) + 1) * 10;
      return (sa ?? 0) - (sb ?? 0);
    });
  }, [M, activeSub, layoutQ.data]);
  // Flat modules (payment / checkout): no widget-order and no audience sub-tabs — render whatever the live
  // serving path returns for this user, in order (served first, then any trace/rule-only locations).
  const flatOrder = useMemo(() => {
    if (M.usesWidgetOrder || M.audienceTabs) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (loc?: string | null) => { if (loc && !seen.has(loc)) { seen.add(loc); out.push(loc); } };
    (r?.served ?? []).forEach((a) => push(a.location));
    (r?.trace ?? []).forEach((t) => push(t.location));
    rules.forEach((x) => push(x.location));
    return out;
  }, [M, r, rules]);
  const baseOrder = M.usesWidgetOrder ? widgetOrder : (M.audienceTabs ? tabOrder : flatOrder);
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { setOrder(baseOrder); }, [baseOrder]);
  const [confirmLayout, setConfirmLayout] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const persistOrder = useMutation({
    mutationFn: async (newOrder: string[]) => {
      // Layout control replaces the app's order entirely — every entry must exist as a slot first.
      const existing = new Map((layoutQ.data ?? []).map((s) => [s.location, s]));
      for (let i = 0; i < newOrder.length; i++) {
        if (!existing.has(newOrder[i])) {
          await api.createLayout({ module: mod, location: newOrder[i], slotOrder: (i + 1) * 10, active: true });
        }
      }
      const fresh = await api.listLayout(mod, true);
      const byLoc = new Map(fresh.map((s) => [s.location, s] as [string, LayoutSlot]));
      const ids = newOrder.map((l) => byLoc.get(l)?.id).filter((x): x is number => x != null);
      const rest = fresh.filter((s) => !newOrder.includes(s.location)).map((s) => s.id!).filter(Boolean);
      await api.reorderLayout([...ids, ...rest]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['layout'] });
      // Tabbed modules (Trade Board) place ads by fixed location per tab — reorder here is a cosmetic admin
      // grouping, so we just save it; we don't ask to flip a live layout toggle the app wouldn't honour yet.
      if (!M.usesWidgetOrder) { toast('success', 'Order saved'); return; }
      if (!layoutToggle?.engineOn) setConfirmLayout(true);
      else { toast('success', 'New order is live'); qc.invalidateQueries({ queryKey: ['preview'] }); }
    },
    onError: (e) => { toast('error', (e as Error).message); setOrder(baseOrder); },
  });
  const enableLayout = useMutation({
    mutationFn: () => api.setToggle({
      adType: M.layoutKey, location: '*', engineOn: true,
      shadowSamplePercent: 0, id: layoutToggle?.id,
    }),
    onSuccess: () => { setConfirmLayout(false); refreshAll(); toast('success', 'Layout control ON — the app follows your order now'); },
    onError: (e) => toast('error', (e as Error).message),
  });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(order, from, to);
    setOrder(next);
    persistOrder.mutate(next);
  };

  // ---- editor state ----
  const [editor, setEditor] = useState<{ location: string; rule: AdRule | null; prefill: AdsDTO | null } | null>(null);

  // For tabbed modules the "in-screen" set is every location across all tabs; for EXPLORE it's the widget order.
  const inScreen = M.usesWidgetOrder ? new Set(widgetOrder) : (M.audienceTabs ? allTabLocations(M) : new Set(baseOrder));

  // Every managed location outside the in-screen set (overlays, bottomsheets, discover, or app-version
  // remap variants like *_MF) — including ones currently serving nothing, so a hidden overlay can always
  // be found and un-hidden.
  const offLayoutLocations = Array.from(new Set([
    ...(r?.served ?? []).map((a) => a.location).filter((l): l is string => !!l),
    ...(r?.trace ?? []).map((t) => t.location),
    ...rules.map((x) => x.location),
  ])).filter((loc) => !inScreen.has(loc) && !loc.endsWith('XXX'));

  const isManaged = (loc: string) =>
    traceByLocation.has(loc) || servedByLocation.has(loc) || chainFor(rules, loc).length > 0
    || (layoutQ.data ?? []).some((s) => s.location === loc);

  return (
    <div className="mx-auto max-w-3xl p-6 pb-24">
      {/* Header + master switch */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
            <Smartphone className="h-5 w-5 text-brand-600" /> Live App View
          </h1>
          <p className="mt-1 text-sm text-slate-500">The {M.screenLabel} screen exactly as the app shows it. Every control is on the card.</p>
        </div>
        <ScreenPicker mod={mod} onPick={setMod} />
      </div>

      {/* THE banner — engine state is impossible to miss */}
      <div className={clsx('mt-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm',
        engineOn ? 'border-green-200 bg-gradient-to-r from-green-50 to-emerald-50' : 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50')}>
        <div className="flex items-center gap-3">
          <span className={clsx('relative flex h-3 w-3')}>
            <span className={clsx('absolute inline-flex h-full w-full rounded-full opacity-75', engineOn ? 'animate-ping bg-green-400' : 'bg-amber-400')} />
            <span className={clsx('relative inline-flex h-3 w-3 rounded-full', engineOn ? 'bg-green-500' : 'bg-amber-500')} />
          </span>
          <div>
            <p className={clsx('text-sm font-semibold', engineOn ? 'text-green-800' : 'text-amber-900')}>
              {engineOn ? 'LIVE — your rules are serving real users' : 'PAUSED — the app is showing production logic'}
            </p>
            <p className={clsx('text-xs', engineOn ? 'text-green-700' : 'text-amber-700')}>
              {engineOn ? 'Every change below applies instantly.' : 'Edits below are saved as drafts. Press Go Live to apply them.'}
            </p>
          </div>
        </div>
        {engineOn ? (
          <Button variant="outline" onClick={() => setConfirmLive('off')}><Pause className="h-4 w-4" /> Pause</Button>
        ) : (
          <Button onClick={() => setConfirmLive('on')} className="bg-amber-600 hover:bg-amber-700"><Rocket className="h-4 w-4" /> Go Live</Button>
        )}
      </div>

      {/* who are we looking at? */}
      <PersonaBar r={r} sampleUser={sampleUser} setSampleUser={setSampleUser}
        fetching={previewQ.isFetching} onRefresh={() => qc.invalidateQueries({ queryKey: ['preview'] })} />

      {!sampleUser && (
        <Card className="mt-6 p-10 text-center text-sm text-slate-400">
          Enter a phone number (or user id) above — you&apos;ll see that user&apos;s {M.screenLabel} screen exactly as the app shows it.
        </Card>
      )}
      {previewQ.isError && <p className="mt-4 text-sm text-red-600">{(previewQ.error as Error).message}</p>}
      {previewQ.isLoading && sampleUser && <Card className="mt-6 p-10 text-center text-sm text-slate-400">Loading the feed…</Card>}

      {r && (
        <>
          <p className="mt-6 text-center text-[11px] text-slate-400">
            {M.usesWidgetOrder
              ? 'drag any card to reorder the screen · click ✏️ to edit · 👁 hides for everyone'
              : 'pick a trade tab · drag to reorder · click ✏️ to edit · 👁 hides for everyone'}
          </p>

          {/* The phone — a real-phone mock with the app's bottom nav. Tapping a bottom tab switches the
              simulated screen (module); the ad card layout is identical across screens. The Trade Board adds
              its own sub-tabs, which differ for paid vs unpaid users (exactly like the app). */}
          <div className="mx-auto mt-2 flex h-[72vh] max-w-md flex-col overflow-hidden rounded-[2.2rem] border-4 border-slate-800 bg-slate-100 shadow-xl">
            <p className="border-b border-slate-200 bg-white py-2 text-center text-[10px] font-medium uppercase tracking-widest text-slate-400">{M.screenLabel}</p>

            {!M.usesWidgetOrder && subTabs.length > 0 && (
              <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1.5 scroll-thin">
                {subTabs.map((t) => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={clsx('shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition',
                      activeSub?.id === t.id ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-700')}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 space-y-2.5 overflow-y-auto scroll-thin p-3">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={order} strategy={verticalListSortingStrategy}>
                  {order.map((loc) => (
                    <SortableEntry key={loc} id={loc}>
                      {isManaged(loc) ? (
                        <SlotCard
                          module={mod}
                          location={loc}
                          servedAds={servedByLocation.get(loc) ?? []}
                          decision={traceByLocation.get(loc)}
                          chain={chainFor(rules, loc)}
                          predicates={predicatesQ.data ?? []}
                          schema={schemaQ.data}
                          engineOn={engineOn}
                          sampleUser={sampleUser}
                          onChanged={refreshAll}
                          onEdit={(rule, prefill) => setEditor({ location: loc, rule, prefill })}
                        />
                      ) : M.usesWidgetOrder ? (
                        <SystemChip name={loc} />
                      ) : (
                        <DormantSlotChip name={loc} />
                      )}
                    </SortableEntry>
                  ))}
                  {order.length === 0 && !M.usesWidgetOrder && (
                    <p className="py-6 text-center text-xs text-slate-400">
                      {M.audienceTabs ? 'No ad slots in this tab for this user.' : 'No ads are served on this screen for this user.'}
                    </p>
                  )}
                </SortableContext>
              </DndContext>
            </div>

            {/* the app's bottom navigation — tap a tab to switch the simulated screen */}
            <PhoneNavBar mod={mod} onPick={(m) => setMod(m)}
              onInactive={(label) => toast('warn', `“${label}” isn’t wired into this tool yet`)} />
          </div>

          {/* Overlays & off-layout surfaces (bottomsheets, silent ads, discover, version-remap *_MF variants) */}
          {offLayoutLocations.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                {M.usesWidgetOrder ? 'Pop-ups & extras (not part of the scrolling screen)' : 'Other served spots (not in the tabs above)'}
              </h2>
              <div className="space-y-2.5">
                {offLayoutLocations.map((loc) => (
                  <SlotCard key={loc}
                    module={mod}
                    location={loc}
                    servedAds={servedByLocation.get(loc) ?? []}
                    decision={traceByLocation.get(loc)}
                    chain={chainFor(rules, loc)}
                    predicates={predicatesQ.data ?? []}
                    schema={schemaQ.data}
                    engineOn={engineOn}
                    sampleUser={sampleUser}
                    onChanged={refreshAll}
                    onEdit={(rule, prefill) => setEditor({ location: loc, rule, prefill })}
                  />
                ))}
              </div>
            </div>
          )}

          {M.usesWidgetOrder && <ConfigWidgetsSection />}
        </>
      )}

      {/* Editor modal */}
      {editor && (
        <AdEditor
          module={mod}
          location={editor.location}
          chain={chainFor(rules, editor.location)}
          rule={editor.rule}
          prefill={editor.prefill}
          assets={assetsQ.data ?? []}
          variants={variantsQ.data ?? []}
          predicates={predicatesQ.data ?? []}
          engineOn={engineOn}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); refreshAll(); }}
        />
      )}

      {/* Go Live / Pause confirms */}
      <ConfirmDialog open={confirmLive === 'on'} title="Go Live?" confirmLabel="Go Live"
        busy={setEngine.isPending}
        body={<>
          <p>The app starts serving from <b>your rules</b> instead of production logic — for <b>all users</b>, instantly.</p>
          <p className="mt-2 text-xs text-slate-500">Untouched slots have a production-passthrough rule, so they keep behaving exactly like today. Only the things you changed will differ.</p>
        </>}
        onConfirm={() => setEngine.mutate(true)} onCancel={() => setConfirmLive(null)} />
      <ConfirmDialog open={confirmLive === 'off'} title="Pause the engine?" confirmLabel="Pause" danger
        busy={setEngine.isPending}
        body={<p>The app goes back to <b>pure production logic</b>. Your rules, conditions and hides stay saved, but stop applying until you go live again.</p>}
        onConfirm={() => setEngine.mutate(false)} onCancel={() => setConfirmLive(null)} />
      <ConfirmDialog open={confirmLayout} title="Apply this order to the app?" confirmLabel="Apply live"
        busy={enableLayout.isPending}
        body={<>
          <p>Your new order is saved. Turn on order control so the app follows it for <b>all users</b>.</p>
          <p className="mt-2 text-xs text-slate-500">Safe: this only re-arranges sections a person already sees — it can never add or remove anything from their screen.</p>
        </>}
        onConfirm={() => enableLayout.mutate()} onCancel={() => { setConfirmLayout(false); toast('warn', 'Order saved as draft — order control is still off'); }} />
    </div>
  );
}

// ---- sortable wrapper -----------------------------------------------------------------------------

function SortableEntry({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('group relative', isDragging && 'z-50 opacity-90')}>
      <button {...attributes} {...listeners}
        className="absolute -left-1 top-1/2 z-10 -translate-y-1/2 cursor-grab rounded p-0.5 text-slate-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
        title="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

/** Non-ad app widget (menu icons, trade cards…) — shown for spatial context, still draggable. */
function SystemChip({ name }: { name: string }) {
  return (
    <div className="ml-3 flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-white/60 px-3 py-1.5">
      <span className="text-[11px] text-slate-400">{friendlyName(name)}</span>
      <span className="text-[9px] uppercase tracking-wide text-slate-300">{isSentinel(name) ? 'placeholder' : 'app section'}</span>
    </div>
  );
}

/** A declared ad slot for this tab that the app is NOT serving to this user right now — paid/unpaid-gated,
 *  empty-state-only (EMPTY_*), or simply no creative. Muted so the preview matches what the app renders. */
function DormantSlotChip({ name }: { name: string }) {
  const emptyOnly = name.toUpperCase().startsWith('EMPTY_');
  return (
    <div className="ml-3 flex items-center justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-1.5">
      <span className="text-[11px] text-slate-400">{friendlyName(name)}</span>
      <span className="text-[9px] uppercase tracking-wide text-slate-300">{emptyOnly ? 'empty-state only' : 'no ad for this user'}</span>
    </div>
  );
}

// ---- the app's bottom navigation bar (mirrored in the phone) --------------------------------------

const NAV_ICONS = { home: Home, wallet: Wallet, idea: Lightbulb, eye: Eye, wrench: Wrench } as const;

/** The real app's bottom tabs. Explore + Trades switch the simulated module; the rest are faded ("not wired"). */
function PhoneNavBar({ mod, onPick, onInactive }: {
  mod: ModuleKey; onPick: (m: ModuleKey) => void; onInactive: (label: string) => void;
}) {
  return (
    <div className="flex items-stretch justify-around border-t border-slate-200 bg-white px-1 py-1.5">
      {NAV_TABS.map((t) => {
        const Icon = NAV_ICONS[t.icon];
        const active = t.module != null && t.module === mod;
        const wired = t.module != null;
        return (
          <button key={t.id}
            onClick={() => (t.module ? onPick(t.module) : onInactive(t.label))}
            title={wired ? `Switch to ${t.label}` : `${t.label} — not wired into this tool yet`}
            className={clsx('flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium transition',
              active ? 'text-brand-600' : wired ? 'text-slate-500 hover:text-slate-700' : 'text-slate-300')}>
            <Icon className={clsx('h-5 w-5', !wired && 'opacity-40')} />
            <span className={clsx(!wired && 'opacity-50')}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- the slot card --------------------------------------------------------------------------------

function SlotCard({ module, location, servedAds, decision, chain, predicates, schema, engineOn, sampleUser, onChanged, onEdit }: {
  module: string;
  location: string;
  servedAds: AdsDTO[];
  decision?: TraceDecision;
  chain: AdRule[];
  predicates: PredicateRule[];
  schema: any;
  engineOn: boolean;
  sampleUser: string;
  onChanged: () => void;
  onEdit: (rule: AdRule | null, prefill: AdsDTO | null) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ad = servedAds[0];
  const killed = !!activeKill(chain);
  const customs = customRules(chain);
  const servingRule = decision?.servedRuleId != null ? chain.find((x) => x.id === decision.servedRuleId) : undefined;
  const isCustomServing = decision?.served === 'ADS' || decision?.served === 'VARIANT';
  const exprOf = (r?: AdRule) => (r?.ruleId != null ? (predicates.find((p) => p.id === r.ruleId)?.expr ?? '') : '');
  const conditionText = isCustomServing && servingRule ? ruleSummary(exprOf(servingRule), schema) : null;

  const niceName = friendlyName(location);

  // hide/show for EVERYONE = kill rule at priority 0
  const hideShow = useMutation({
    mutationFn: async (hide: boolean) => {
      const kill = chain.find(isKillRule);
      if (kill?.id) return api.updateRule(kill.id, { ...kill, active: hide });
      if (hide) return api.createRule({ module, location, adsId: null, variantId: null, ruleId: null, priority: KILL_PRIORITY, active: true, visible: false });
    },
    onSuccess: (_d, hide) => {
      onChanged();
      toast(engineOn ? 'success' : 'warn',
        hide
          ? (engineOn ? `“${niceName}” is now hidden for everyone` : `“${niceName}” will hide once you press Go Live`)
          : (engineOn ? `“${niceName}” is showing again` : `“${niceName}” will show once you press Go Live`));
    },
    onError: (e) => toast('error', (e as Error).message),
  });

  // revert = drop all custom rules + release kill → pure production passthrough
  const [confirmRevert, setConfirmRevert] = useState(false);
  const revert = useMutation({
    mutationFn: async () => {
      for (const c of chain.filter(isCustomRule)) if (c.id) await api.deleteRule(c.id);
      const kill = chain.find(isKillRule);
      if (kill?.id && kill.active) await api.updateRule(kill.id, { ...kill, active: false });
    },
    onSuccess: () => { setConfirmRevert(false); onChanged(); toast('success', `“${niceName}” is back to normal production behaviour`); },
    onError: (e) => toast('error', (e as Error).message),
  });

  const patchRule = useMutation({
    mutationFn: (r: AdRule) => api.updateRule(r.id!, r),
    onSuccess: onChanged,
    onError: (e) => toast('error', (e as Error).message),
  });
  const deleteRule = useMutation({
    mutationFn: (id: number) => api.deleteRule(id),
    onSuccess: () => { onChanged(); toast('success', 'Ad removed'); },
    onError: (e) => toast('error', (e as Error).message),
  });

  const empty = !ad;
  const tiles = ad ? parseTiles(ad.customWidgetData) : null;
  const widget = ad && !tiles ? parseWidgetImages(ad.customWidgetData) : null;

  return (
    <div className={clsx('overflow-hidden rounded-xl border bg-white shadow-sm transition',
      killed ? 'border-red-200' : empty ? 'border-dashed border-slate-300' : 'border-slate-200 hover:shadow-md')}>

      {/* creative preview */}
      {!empty && (
        <button onClick={() => setOpen(!open)} className="block w-full text-left">
          {tiles ? (
            <div className="p-2">
              <div className={clsx('grid grid-cols-4 gap-1.5', killed && 'opacity-40 grayscale')}>
                {tiles.slice(0, 8).map((t, i) => (
                  <div key={i} className="rounded-md border border-slate-100 p-1" style={{ gridColumn: `span ${Math.min(t.c ?? 1, 4)}` }}>
                    {t.asset?.url && (
                      <div className="flex h-11 w-full items-center justify-center overflow-hidden rounded bg-slate-50">
                        <img src={t.asset.url} alt="" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                    <p className="mt-0.5 truncate text-[9px] text-slate-500">{t.title || t.id}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : ad.imageURL ? (
            <div className={clsx('flex max-h-40 w-full items-center justify-center overflow-hidden bg-slate-50', killed && 'opacity-40 grayscale')}>
              <img src={ad.imageURL} alt="" className="max-h-40 w-full object-contain" />
            </div>
          ) : widget ? (
            <div className={clsx('space-y-1 p-2', killed && 'opacity-40 grayscale')}>
              {widget.titleImage && (
                <div className="flex h-10 items-center overflow-hidden rounded bg-slate-50 px-1">
                  <img src={widget.titleImage} alt="" className="max-h-full object-contain" />
                </div>
              )}
              {widget.images.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto scroll-thin">
                  {widget.images.map((im, i) => (
                    <div key={i} className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-100 bg-slate-50">
                      {im.image && <img src={im.image} alt="" className="max-h-full max-w-full object-contain" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={clsx('flex h-12 items-center justify-center bg-slate-50 text-xs text-slate-400', killed && 'opacity-50')}>{ad.adType ?? 'widget'}</div>
          )}
        </button>
      )}

      {empty && (
        <div className="flex items-center justify-center gap-2 px-3 pt-3 text-xs text-slate-400">
          {killed ? 'Hidden for everyone' : 'Nothing is shown here for this person right now'}
        </div>
      )}

      {/* the control strip — everything eye-front, no hunting */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] font-medium text-slate-600" title={friendlyHint(location) ? `${friendlyHint(location)} (${location})` : location}>
            {niceName}
          </span>
          {killed ? <Badge color="red">hidden by you</Badge>
            : empty ? null
            : isCustomServing ? <Badge color="blue">your ad</Badge>
            : <Badge color="slate">normal</Badge>}
          {servedAds.length > 1 && <Badge color="slate">+{servedAds.length - 1} more here</Badge>}
          {conditionText && conditionText !== 'everyone' && <Badge color="amber">only: {conditionText}</Badge>}
          {isCustomServing && conditionText === 'everyone' && <Badge color="green">everyone</Badge>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <IconBtn title={killed ? 'Show this again (for everyone)' : 'Hide this (for everyone)'}
            onClick={() => hideShow.mutate(!killed)} disabled={hideShow.isPending}>
            {killed ? <EyeOff className="h-4 w-4 text-red-500" /> : <Eye className="h-4 w-4 text-green-600" />}
          </IconBtn>
          <IconBtn title={isCustomServing ? 'Edit this ad' : 'Put your own ad here'}
            onClick={() => onEdit(isCustomServing && servingRule ? servingRule : null, ad ?? null)}>
            {isCustomServing ? <Pencil className="h-4 w-4 text-brand-600" /> : <Plus className="h-4 w-4 text-brand-600" />}
          </IconBtn>
          {(customs.length > 0 || killed) && (
            <IconBtn title="Back to normal (remove your changes here)" onClick={() => setConfirmRevert(true)}>
              <Undo2 className="h-4 w-4 text-slate-400" />
            </IconBtn>
          )}
          {(servedAds.length > 0 || customs.length > 0) && (
            <IconBtn title="Details" onClick={() => setOpen(!open)}>
              {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </IconBtn>
          )}
        </div>
      </div>

      {/* expanded: why + all rules + tiles */}
      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3">
          {decision?.reason && <p className="text-[11px] text-slate-500">Why this person sees this: {decision.reason}</p>}

          {customs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Your ads here {customs.length > 1 ? '(the first one that matches a person wins)' : ''}
              </p>
              {customs.map((cr) => {
                const e = exprOf(cr);
                return (
                  <div key={cr.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-700">
                        {cr.variantId != null ? 'Your custom creative' : 'An existing creative you picked'}
                        {decision?.servedRuleId === cr.id && <Badge color="green"> showing now</Badge>}
                        {!engineOn && cr.active && <Badge color="amber"> waiting for Go Live</Badge>}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">shown to: {e.trim() ? ruleSummary(e, schema) : 'everyone'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Toggle checked={!!cr.active} onChange={(v) => patchRule.mutate({ ...cr, active: v })} />
                      <button onClick={() => onEdit(cr, ad ?? null)} className="text-brand-600 hover:underline"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => cr.id && deleteRule.mutate(cr.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tiles && ad?.location && (
            <TileGrid menuLocation={ad.location} servedTiles={tiles} sampleUserId={sampleUser} />
          )}
          {tiles && !engineOn && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-700">Tile hides apply once you Go Live.</p>
          )}
        </div>
      )}

      <ConfirmDialog open={confirmRevert} title={`Put “${niceName}” back to normal?`} confirmLabel="Yes, back to normal" danger
        busy={revert.isPending}
        body={<p>Removes your custom ads and hides at this spot. The app goes back to exactly what it showed before you touched it.</p>}
        onConfirm={() => revert.mutate()} onCancel={() => setConfirmRevert(false)} />
    </div>
  );
}

// ---- viewer bar: number search drives the whole preview ("view the app as this phone number") ------

function PersonaBar({ r, sampleUser, setSampleUser, fetching, onRefresh }: {
  r?: PreviewResult; sampleUser: string; setSampleUser: (v: string) => void;
  fetching: boolean; onRefresh: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  useEffect(() => { setQuery(sampleUser); }, [sampleUser]);

  // who is the current user, really? (refreshes whenever the id changes)
  const factsQ = useQuery({
    queryKey: ['user-facts', sampleUser],
    queryFn: () => api.sampleUser({ q: sampleUser }),
    enabled: !!sampleUser,
    staleTime: 60_000,
  });
  const facts = factsQ.data;

  // typed a user id or phone number → resolve it and report the real cohorts
  const lookup = useMutation({
    mutationFn: (q: string) => api.sampleUser({ q }),
    onSuccess: (f) => setSampleUser(String(f.userId)),
    onError: (e) => toast('error', (e as Error).message),
  });
  const commitQuery = () => {
    const q = query.trim();
    if (!q || q === sampleUser) return;
    lookup.mutate(q);
  };

  return (
    <Card className="mt-4 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <UserRound className="h-3.5 w-3.5" /> Preview the app for a specific phone number — exactly what that user sees in production.
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="w-72">
          <Input label="Phone number (or user id)" value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitQuery(); }}
            onBlur={commitQuery}
            placeholder="user id or 10-digit number" />
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={!sampleUser || fetching}>
          <RefreshCw className={clsx('h-4 w-4', (fetching || lookup.isPending) && 'animate-spin')} /> Refresh
        </Button>

        {facts && (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 pb-1">
            <Badge color="slate">#{facts.userId}{facts.contactNumber ? ` · ${facts.contactNumber}` : ''}</Badge>
            <Badge color={facts.paid ? 'green' : 'slate'}>{facts.paid ? 'paid' : facts.guest ? 'guest' : 'free'}</Badge>
            <Badge color={facts.kycCompleted ? 'green' : 'amber'}>KYC {facts.kycCompleted ? 'done' : 'pending'}</Badge>
            {facts.os && <Badge color="blue">{facts.os}{r ? ` · v${r.appVersion}` : ''}</Badge>}
            {r && <Badge color="slate">{(r.served ?? []).length} ads shown</Badge>}
          </div>
        )}
      </div>
      {factsQ.isError && !!sampleUser && (
        <p className="mt-2 text-xs text-red-600">{(factsQ.error as Error).message}</p>
      )}
    </Card>
  );
}

function IconBtn({ children, title, onClick, disabled }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className="rounded-md p-1.5 transition hover:bg-slate-100 disabled:opacity-40">
      {children}
    </button>
  );
}

// ---- screen picker (switch the previewed module, including the payment / checkout surfaces) --------

function ScreenPicker({ mod, onPick }: { mod: ModuleKey; onPick: (m: ModuleKey) => void }) {
  return (
    <select value={mod} onChange={(e) => onPick(e.target.value as ModuleKey)}
      title="Switch the previewed screen"
      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none">
      {MODULE_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.modules.map((k) => (
            <option key={k} value={k}>{MODULES[k].label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ---- config widgets (the other surface, /resources/config/v5) — live instantly, no engine gate ----

function ConfigWidgetsSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const widgetsQ = useQuery({ queryKey: ['config-widgets'], queryFn: () => api.listConfigWidgets(), enabled: open });

  const toggle = useMutation({
    mutationFn: ({ module, show }: { module: string; show: boolean }) => api.setConfigWidgetVisibility(module, show),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['config-widgets'] });
      toast('success', v.show ? `${v.module} is visible in the app` : `${v.module} hidden — live immediately`);
    },
    onError: (e) => toast('error', (e as Error).message),
  });

  return (
    <div className="mt-8">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:shadow-md">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Megaphone className="h-4 w-4 text-brand-600" /> Config banners &amp; carousels (always-live switches)
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <p className="px-1 text-[11px] text-slate-400">These come from <code>config/v5</code>, not the ads engine — the switch applies immediately, Go Live not needed.</p>
          {widgetsQ.isLoading && <p className="px-1 text-xs text-slate-400">Loading…</p>}
          {(widgetsQ.data ?? []).map((w) => (
            <Card key={w.module} className="flex items-center gap-3 p-2.5">
              <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                {w.iconUrl ? <img src={w.iconUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[9px] text-slate-300">no image</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs text-slate-700">{w.module}</span>
                  <Badge color={w.showCarousel ? 'green' : 'red'}>{w.showCarousel ? 'visible' : 'hidden'}</Badge>
                </div>
                <p className="truncate text-[11px] text-slate-400">{[w.header, w.subHeader].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <Toggle checked={!!w.showCarousel} onChange={(v) => toggle.mutate({ module: w.module, show: v })} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
