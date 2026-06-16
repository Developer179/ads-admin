'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Power, GitCompare, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { EngineToggle, ShadowDiff } from '@/lib/types';
import { Button, Card, Badge, Input, Toggle, Select, EmptyState, ConfirmDialog, useToast } from '@/components/ui';
import { isPassthroughRule } from '@/lib/rules';
import { useModule, MODULES } from '@/lib/modules';

/**
 * ENGINE & ROLLOUT — the master switches plus the safety net (shadow diffs).
 * The two switches that matter: EXPLORE (ads serving) and EXPLORE_LAYOUT (section order).
 * Advanced per-location overrides and shadow sampling live below.
 */
export default function EnginePage() {
  const [tab, setTab] = useState<'rollout' | 'shadow'>('rollout');

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-xl font-semibold text-slate-800">Engine &amp; rollout</h1>
      <p className="mt-1 text-sm text-slate-500">Who serves the app — your rules or production code — and proof they agree.</p>

      <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
        <TabBtn active={tab === 'rollout'} onClick={() => setTab('rollout')}><Power className="h-4 w-4" /> Rollout</TabBtn>
        <TabBtn active={tab === 'shadow'} onClick={() => setTab('shadow')}><GitCompare className="h-4 w-4" /> Shadow diffs</TabBtn>
      </div>

      {tab === 'rollout' ? <RolloutTab /> : <ShadowTab />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium transition',
        active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
      {children}
    </button>
  );
}

// ---- rollout ---------------------------------------------------------------------------------------

function RolloutTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [mod] = useModule();
  const M = MODULES[mod];
  const togglesQ = useQuery({ queryKey: ['toggles'], queryFn: () => api.listToggles() });
  const layoutQ = useQuery({ queryKey: ['layout', mod, true], queryFn: () => api.listLayout(mod, true) });

  const set = useMutation({
    mutationFn: (t: EngineToggle) => api.setToggle(t),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['toggles'] }); qc.invalidateQueries({ queryKey: ['preview'] }); toast('success', 'Saved'); },
    onError: (e) => toast('error', (e as Error).message),
  });

  const toggles = togglesQ.data ?? [];
  const masters: { adType: string; title: string; sub: string }[] = [
    { adType: mod, title: 'Ads serving', sub: 'Your rules decide what shows in every slot. OFF = production code decides.' },
    // Section-order control only applies to single-scroll screens (EXPLORE). The Trade Board places ads by
    // fixed location per tab, so there is no live layout order to toggle yet.
    ...(M.usesWidgetOrder
      ? [{ adType: M.layoutKey, title: 'Section order', sub: 'The app follows your drag-and-drop order (re-arranges only — never adds or removes sections). OFF = production order.' }]
      : []),
  ];

  const [adding, setAdding] = useState(false);
  const locations = ['*', ...Array.from(new Set((layoutQ.data ?? []).map((s) => s.location)))];
  const overrides = toggles.filter((t) => t.location !== '*');

  return (
    <div className="mt-6 space-y-6">
      {/* the two switches that matter */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {masters.map((m) => {
          const t = toggles.find((x) => x.adType === m.adType && x.location === '*');
          const on = t?.engineOn ?? false;
          return (
            <Card key={m.adType} className={clsx('p-5', on && 'border-green-300 ring-1 ring-green-100')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{m.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{m.sub}</p>
                </div>
                <Badge color={on ? 'green' : 'slate'}>{on ? 'LIVE' : 'OFF'}</Badge>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Toggle checked={on}
                  onChange={(v) => set.mutate({ adType: m.adType, location: '*', engineOn: v, shadowSamplePercent: t?.shadowSamplePercent ?? 0, id: t?.id })}
                  label={on ? 'Serving from your rules' : 'Production serving'} />
                {m.adType === mod && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-500" title="While OFF: % of users whose request also runs the engine silently, recording any differences">
                    shadow
                    <input type="number" min={0} max={100} defaultValue={t?.shadowSamplePercent ?? 0}
                      onBlur={(e) => set.mutate({ adType: m.adType, location: '*', engineOn: on, shadowSamplePercent: Number(e.target.value), id: t?.id })}
                      className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs" />%
                  </label>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* per-location overrides (advanced) */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Per-location overrides</h2>
            <p className="text-xs text-slate-400">A specific (type, location) row beats the master switch — useful for piloting one slot.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add override</Button>
        </div>

        <div className="mt-3 space-y-2">
          {overrides.length === 0 && <p className="text-sm text-slate-400">None — the master switches control everything.</p>}
          {overrides.map((t) => (
            <Card key={`${t.adType}-${t.location}`} className="flex items-center justify-between p-3">
              <div>
                <span className="text-sm font-medium text-slate-800">{t.adType}</span>
                <span className="ml-1.5 font-mono text-xs text-slate-500">{t.location}</span>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  shadow
                  <input type="number" min={0} max={100} defaultValue={t.shadowSamplePercent ?? 0}
                    onBlur={(e) => set.mutate({ ...t, shadowSamplePercent: Number(e.target.value) })}
                    className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs" />%
                </label>
                <Toggle checked={t.engineOn} onChange={(v) => set.mutate({ ...t, engineOn: v })} label={t.engineOn ? 'LIVE' : 'OFF'} />
              </div>
            </Card>
          ))}
        </div>

        {adding && <AddToggle adTypes={masters.map((m) => m.adType)} locations={locations} onClose={() => setAdding(false)}
          onSave={(t) => { set.mutate(t); setAdding(false); }} />}
      </div>

      <ResetCard />
    </div>
  );
}

/** Clean-slate escape hatch: remove every dashboard change so the app behaves exactly like production. */
function ResetCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [mod] = useModule();
  const M = MODULES[mod];
  const [confirming, setConfirming] = useState(false);

  const reset = useMutation({
    mutationFn: async () => {
      // 1) remove every rule for THIS module that isn't the production passthrough (your ads, hides, leftovers)
      const rules = await api.listRules(mod, true);
      for (const r of rules) {
        if (!isPassthroughRule(r) && r.id) await api.deleteRule(r.id);
      }
      // 2) remove every tile hide (super-menu tiles are EXPLORE-only)
      if (M.usesWidgetOrder) {
        const tiles = await api.listTiles(true);
        for (const t of tiles) {
          if (t.id) await api.deleteTile(t.id);
        }
      }
      // 3) switch this module's engines (serving + layout) off
      const toggles = await api.listToggles();
      for (const t of toggles) {
        if ((t.adType === mod || t.adType === M.layoutKey) && (t.engineOn || (t.shadowSamplePercent ?? 0) > 0)) {
          await api.setToggle({ ...t, engineOn: false, shadowSamplePercent: 0 });
        }
      }
    },
    onSuccess: () => {
      setConfirming(false);
      qc.invalidateQueries();
      toast('success', 'Everything is back to production — the app behaves exactly as before this tool existed');
    },
    onError: (e) => toast('error', (e as Error).message),
  });

  return (
    <Card className="border-red-200 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700"><RotateCcw className="h-4 w-4" /> Start fresh</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Removes <b>all</b> your ads, conditions and hides (including old test leftovers) and switches everything back
            to production. Use this if things got messy — it can never break the app.
          </p>
        </div>
        <Button variant="danger" onClick={() => setConfirming(true)}>Reset everything</Button>
      </div>
      <ConfirmDialog open={confirming} title="Remove all your changes?" confirmLabel="Yes, reset everything" danger
        busy={reset.isPending}
        body={<p>Every ad, condition, hide and tile change made from this dashboard is deleted, and the app goes back to
          pure production behaviour. This cannot be undone.</p>}
        onConfirm={() => reset.mutate()} onCancel={() => setConfirming(false)} />
    </Card>
  );
}

function AddToggle({ adTypes, locations, onClose, onSave }: { adTypes: string[]; locations: string[]; onClose: () => void; onSave: (t: EngineToggle) => void }) {
  const [adType, setAdType] = useState(adTypes[0] ?? 'EXPLORE');
  const [location, setLocation] = useState('*');
  return (
    <Card className="mt-3 space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Select label="Switch" value={adType} onChange={setAdType}
          options={adTypes.map((a) => ({ value: a, label: a }))} />
        <Select label="Location" value={location} onChange={setLocation}
          options={locations.map((l) => ({ value: l, label: l }))} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave({ adType, location, engineOn: false, shadowSamplePercent: 0 })}>Create (OFF)</Button>
      </div>
    </Card>
  );
}

// ---- shadow diffs ----------------------------------------------------------------------------------

function ShadowTab() {
  const [mod] = useModule();
  const [userId, setUserId] = useState('');
  const [mismatchesOnly, setMismatchesOnly] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const q = useQuery({
    queryKey: ['shadow', mod, userId, mismatchesOnly, page],
    queryFn: () => api.shadowDiffs({
      module: mod, userId: userId ? Number(userId) : undefined,
      mismatchesOnly, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
    }),
  });

  return (
    <div className="mt-6">
      <p className="text-sm text-slate-500">Where the engine disagreed with production during shadow runs. Drive these to zero before going live.</p>

      <div className="mt-4 flex items-end gap-4">
        <div className="w-48"><Input label="Filter by user id" type="number" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(0); }} /></div>
        <div className="pb-2"><Toggle checked={mismatchesOnly} onChange={(v) => { setMismatchesOnly(v); setPage(0); }} label="Mismatches only" /></div>
      </div>

      <div className="mt-5 space-y-3">
        {q.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {q.data && q.data.length === 0 && page === 0 && (
          <EmptyState title="No diffs recorded" hint="Either shadow isn't sampling yet (set a shadow % on the Rollout tab), or the engine matches production perfectly." />
        )}
        {(q.data ?? []).map((d) => <DiffRow key={d.id} d={d} />)}
      </div>

      {((q.data?.length ?? 0) === PAGE_SIZE || page > 0) && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Newer</Button>
          <span className="text-xs text-slate-400">page {page + 1}</span>
          <Button size="sm" variant="outline" disabled={(q.data?.length ?? 0) < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Older →</Button>
        </div>
      )}
    </div>
  );
}

function DiffRow({ d }: { d: ShadowDiff }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex cursor-pointer items-center justify-between" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          <Badge color={d.match ? 'green' : 'red'}>{d.match ? 'match' : 'diff'}</Badge>
          <span className="text-sm text-slate-700">user {d.userId} · app v{d.appVersion}</span>
          {d.location && <span className="font-mono text-xs text-slate-400">{d.location}</span>}
        </div>
        <span className="text-xs text-slate-400">{d.createdAt?.replace('T', ' ').slice(0, 19)}</span>
      </div>
      <p className="mt-2 text-xs text-slate-600">{d.diffSummary}</p>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Pre title="Production" json={d.legacyOutput} />
          <Pre title="Engine" json={d.engineOutput} />
        </div>
      )}
    </Card>
  );
}

function Pre({ title, json }: { title: string; json?: string | null }) {
  let pretty = json ?? '';
  try { pretty = JSON.stringify(JSON.parse(json ?? ''), null, 2); } catch { /* keep raw */ }
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400">{title}</p>
      <pre className="max-h-64 overflow-auto scroll-thin rounded-lg bg-slate-900 p-2 font-mono text-[10px] leading-relaxed text-slate-100">{pretty}</pre>
    </div>
  );
}
