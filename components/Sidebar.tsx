'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LayoutDashboard, Power, Layers, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { MODULES, useModule } from '@/lib/modules';

const NAV = [
  { href: '/feed', label: 'Live App View', icon: Smartphone, hint: 'see & edit everything' },
  { href: '/', label: 'Overview', icon: LayoutDashboard, hint: 'status & import' },
  { href: '/engine', label: 'Engine & rollout', icon: Power, hint: 'go live · shadow' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mod] = useModule();
  const toggles = useQuery({ queryKey: ['toggles'], queryFn: () => api.listToggles() });

  const def = MODULES[mod];
  const wildcard = (toggles.data ?? []).find((t) => t.adType === mod && t.location === '*');
  const anyOn = (toggles.data ?? []).some((t) => t.adType === mod && t.engineOn);
  const mode = anyOn ? 'LIVE' : ((wildcard?.shadowSamplePercent ?? 0) > 0 ? 'SHADOW' : 'OFF');

  return (
    <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Layers className="h-5 w-5 text-brand-600" />
        <div>
          <p className="text-sm font-semibold text-slate-800">{def.label} Ads</p>
          <p className="text-[11px] text-slate-400">control what the app shows</p>
        </div>
      </div>

      <div className="px-3 py-2">
        <p className="mb-1 px-1 text-[10px] text-slate-400">Now viewing: <span className="font-medium text-slate-600">{def.screenLabel}</span> · switch screens in the phone&apos;s bottom bar</p>
        <ModeBadge mode={mode} />
      </div>

      <nav className="flex-1 space-y-1 px-2 pb-4">
        {NAV.map((n) => {
          const active = pathname === n.href;
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href}
              className={clsx('flex items-center gap-2.5 rounded-xl px-3 py-2.5',
                active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')}>
              <Icon className="h-4 w-4 shrink-0" />
              <span>
                <span className={clsx('block text-sm', active && 'font-semibold')}>{n.label}</span>
                <span className="block text-[10px] text-slate-400">{n.hint}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function ModeBadge({ mode }: { mode: 'OFF' | 'SHADOW' | 'LIVE' }) {
  const cfg = {
    OFF: { c: 'bg-amber-100 text-amber-800', t: 'PAUSED · production serving' },
    SHADOW: { c: 'bg-amber-100 text-amber-800', t: 'SHADOW · logging diffs' },
    LIVE: { c: 'bg-green-100 text-green-700', t: 'LIVE · your rules serving' },
  }[mode];
  return <div className={clsx('rounded-lg px-3 py-1.5 text-center text-xs font-medium', cfg.c)}>{cfg.t}</div>;
}
