'use client';

import {
  AdRule, AdsDTO, AssetVariant, ConfigWidget, DslSchema, EngineToggle, Experiment, ExperimentBucket,
  LayoutSlot, PredicateRule, PreviewResult, SampleUser, ShadowDiff, SuperMenuTile,
} from './types';

// Frontend calls the backend directly. Set NEXT_PUBLIC_BACKEND_URL (e.g. https://uat-api.univest.in).
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://dev-api.univest.in';
const BASE = `${BACKEND}/admin/ads/explore`;

function buildUrl(path: string) {
  if (!path) return BASE; // root endpoint, no trailing slash (Spring Boot 3 disables trailing-slash match)
  if (path.startsWith('?')) return BASE + path;
  return `${BASE}/${path}`;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = json?.error || json?.message || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  // backend wraps payloads as { data: <body> }
  return (json && 'data' in json ? json.data : json) as T;
}

export const api = {
  // schema
  schema: () => req<DslSchema>('GET', 'schema'),

  // predicates
  listPredicates: (includeInactive = false) =>
    req<PredicateRule[]>('GET', `predicates?includeInactive=${includeInactive}`),
  createPredicate: (r: PredicateRule) => req<{ id: number }>('POST', 'predicates', r),
  updatePredicate: (id: number, r: PredicateRule) => req('PUT', `predicates/${id}`, r),
  deletePredicate: (id: number) => req('DELETE', `predicates/${id}`),

  // layout
  listLayout: (module = 'EXPLORE', includeInactive = false) =>
    req<LayoutSlot[]>('GET', `layout?module=${module}&includeInactive=${includeInactive}`),
  createLayout: (r: LayoutSlot) => req<{ id: number }>('POST', 'layout', r),
  updateLayout: (id: number, r: LayoutSlot) => req('PUT', `layout/${id}`, r),
  reorderLayout: (ids: number[]) => req('PUT', 'layout/reorder', ids),
  deleteLayout: (id: number) => req('DELETE', `layout/${id}`),

  // ad rules
  listRules: (module = 'EXPLORE', includeInactive = false) =>
    req<AdRule[]>('GET', `?module=${module}&includeInactive=${includeInactive}`),
  createRule: (r: AdRule) => req<{ id: number }>('POST', '', r),
  updateRule: (id: number, r: AdRule) => req('PUT', `${id}`, r),
  reorderRules: (ids: number[]) => req('PUT', 'reorder', ids),
  deleteRule: (id: number) => req('DELETE', `${id}`),

  // variants
  listVariants: (includeInactive = false) =>
    req<AssetVariant[]>('GET', `variants?includeInactive=${includeInactive}`),
  createVariant: (r: AssetVariant) => req<{ id: number }>('POST', 'variants', r),
  updateVariant: (id: number, r: AssetVariant) => req('PUT', `variants/${id}`, r),
  deleteVariant: (id: number) => req('DELETE', `variants/${id}`),

  // tiles
  listTiles: (includeInactive = false) =>
    req<SuperMenuTile[]>('GET', `tiles?includeInactive=${includeInactive}`),
  syncTiles: (userId: number) => req<{ registered: string[] }>('POST', `tiles/sync?userId=${userId}`),
  createTile: (r: SuperMenuTile) => req<{ id: number }>('POST', 'tiles', r),
  updateTile: (id: number, r: SuperMenuTile) => req('PUT', `tiles/${id}`, r),
  deleteTile: (id: number) => req('DELETE', `tiles/${id}`),

  // experiments
  listExperiments: () => req<Experiment[]>('GET', 'experiments'),
  listBuckets: (id: number) => req<ExperimentBucket[]>('GET', `experiments/${id}/buckets`),
  createExperiment: (r: Experiment) => req<{ id: number }>('POST', 'experiments', r),
  updateExperiment: (id: number, r: Experiment) => req('PUT', `experiments/${id}`, r),
  upsertBucket: (id: number, b: ExperimentBucket) => req('PUT', `experiments/${id}/buckets`, b),

  // toggle
  listToggles: () => req<EngineToggle[]>('GET', 'toggle'),
  setToggle: (r: EngineToggle) => req('PUT', 'toggle', r),

  // shadow diffs
  shadowDiffs: (params: { module?: string; userId?: number; mismatchesOnly?: boolean; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.module) q.set('module', params.module);
    if (params.userId != null) q.set('userId', String(params.userId));
    q.set('mismatchesOnly', String(params.mismatchesOnly ?? true));
    q.set('limit', String(params.limit ?? 50));
    q.set('offset', String(params.offset ?? 0));
    return req<ShadowDiff[]>('GET', `shadow-diffs?${q.toString()}`);
  },

  // assets (live ads creatives, to show image/action behind each rule)
  listAssets: (module = 'EXPLORE') => req<AdsDTO[]>('GET', `assets?module=${module}`),

  // config-v5 widgets (explore_carousels_config rows the app renders via /resources/config/v5)
  listConfigWidgets: () => req<ConfigWidget[]>('GET', 'config-widgets'),
  setConfigWidgetVisibility: (module: string, show: boolean) =>
    req('PUT', `config-widgets/${encodeURIComponent(module)}/visibility?show=${show}`),

  // bootstrap (import current live assets + layout)
  bootstrap: (opts: { module?: string; sampleUserId?: number; dryRun?: boolean } = {}) => {
    const q = new URLSearchParams();
    q.set('module', opts.module ?? 'EXPLORE');
    if (opts.sampleUserId != null) q.set('sampleUserId', String(opts.sampleUserId));
    q.set('dryRun', String(opts.dryRun ?? true));
    return req<{ dryRun: boolean; currentAds: number; layoutOrder: string[]; slotsToCreate: string[]; rulesToCreate: number; note: string }>('POST', `bootstrap?${q.toString()}`);
  },

  // sample user: pick a random user in a cohort (state=PAID/FREE/GUEST/KYC_DONE/KYC_PENDING/ANY)
  // or resolve q (user id / contact number) and learn which cohorts they're really in
  sampleUser: (p: { state?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (p.state) qs.set('state', p.state);
    if (p.q) qs.set('q', p.q);
    return req<SampleUser>('GET', `sample-user?${qs.toString()}`);
  },

  // preview (dry-run through the REAL serving path, with per-location explanation trace)
  preview: (userId: number, module = 'EXPLORE', location?: string) => {
    const q = new URLSearchParams({ userId: String(userId), module });
    if (location) q.set('location', location);
    return req<PreviewResult>('GET', `preview?${q.toString()}`);
  },
};
