'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { DownloadCloud } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Badge, Button, Input } from '@/components/ui';
import { useModule, MODULES } from '@/lib/modules';

export default function Overview() {
  const [mod] = useModule();
  const M = MODULES[mod];
  const toggles = useQuery({ queryKey: ['toggles'], queryFn: () => api.listToggles() });
  const rules = useQuery({ queryKey: ['rules', mod, true], queryFn: () => api.listRules(mod, true) });
  const layout = useQuery({ queryKey: ['layout', mod, true], queryFn: () => api.listLayout(mod, true) });

  const liveCount = (toggles.data ?? []).filter((t) => t.engineOn).length;
  const shadowCount = (toggles.data ?? []).filter((t) => !t.engineOn && (t.shadowSamplePercent ?? 0) > 0).length;
  const isEmpty = (layout.data ?? []).length === 0 && (rules.data ?? []).length === 0;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-xl font-semibold text-slate-800">Overview · {M.label}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everything you see in the app is editable from <Link href="/feed" className="text-brand-600 hover:underline">Live App View</Link>.
        This page is status + one-time setup. Switch the app screen in the left sidebar.
      </p>

      <BootstrapCard empty={isEmpty} />

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Layout slots" value={(layout.data ?? []).filter((s) => s.active).length} />
        <Stat label="Active ad rules" value={(rules.data ?? []).filter((r) => r.active).length} />
        <Stat label="Live switches" value={liveCount} tone={liveCount ? 'green' : 'slate'} />
        <Stat label="Shadowing" value={shadowCount} tone={shadowCount ? 'amber' : 'slate'} />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Switches</h2>
        <div className="space-y-1.5">
          {(toggles.data ?? []).length === 0 && <p className="text-sm text-slate-400">No switches configured — the app is on pure production logic.</p>}
          {(toggles.data ?? []).map((t) => (
            <div key={`${t.adType}-${t.location}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <span className="text-sm text-slate-700">{t.adType} · <span className="font-mono text-xs">{t.location}</span></span>
              <div className="flex items-center gap-2">
                {(t.shadowSamplePercent ?? 0) > 0 && !t.engineOn && <Badge color="amber">shadow {t.shadowSamplePercent}%</Badge>}
                <Badge color={t.engineOn ? 'green' : 'slate'}>{t.engineOn ? 'LIVE' : 'OFF'}</Badge>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3 text-sm">
          <Link href="/engine" className="text-brand-600 hover:underline">Manage rollout &amp; shadow diffs →</Link>
        </div>
      </Card>
    </div>
  );
}

function BootstrapCard({ empty }: { empty: boolean }) {
  const qc = useQueryClient();
  const [mod] = useModule();
  const M = MODULES[mod];
  const [userId, setUserId] = useState('');
  const [applied, setApplied] = useState(false);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.bootstrap({ module: mod, sampleUserId: userId ? Number(userId) : undefined, dryRun }),
    onSuccess: (_d, dryRun) => {
      if (!dryRun) {
        setApplied(true);
        qc.invalidateQueries({ queryKey: ['layout'] });
        qc.invalidateQueries({ queryKey: ['rules'] });
        qc.invalidateQueries({ queryKey: ['predicates'] });
      }
    },
  });

  return (
    <Card className="mt-6 border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-center gap-2">
        <DownloadCloud className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-800">Import current assets</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        One-time import of the live {M.label} <code>ads</code> rows + widget order into the engine tables, so every
        current asset shows up in Live App View. Safe to re-run — existing rows are skipped.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-56">
          <Input label="Sample user id (for layout order — optional)" type="number" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="e.g. 212" />
        </div>
        <Button variant="outline" onClick={() => run.mutate(true)} disabled={run.isPending}>Preview import</Button>
        <Button onClick={() => run.mutate(false)} disabled={run.isPending}>Apply import</Button>
      </div>

      {run.isError && <p className="mt-2 text-xs text-red-600">{(run.error as Error).message}</p>}
      {run.data && (
        <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">
          <p>{run.data.dryRun ? 'Preview' : 'Applied'} · current ads: <b>{run.data.currentAds}</b> · slots to create: <b>{run.data.slotsToCreate.length}</b> · rules to create: <b>{run.data.rulesToCreate}</b></p>
          <p className="mt-1 text-[11px] text-slate-400">Layout order: {run.data.layoutOrder.join(' → ')}</p>
          {applied && <p className="mt-1 font-medium text-green-600">Imported — open <Link href="/feed" className="underline">Live App View</Link> to see and edit everything.</p>}
        </div>
      )}
      {!empty && <p className="mt-2 text-[11px] text-amber-600">Tables already have data; import skips anything that already exists (safe to re-run).</p>}
    </Card>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'green' | 'amber' }) {
  const color = tone === 'green' ? 'text-green-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-800';
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </Card>
  );
}
