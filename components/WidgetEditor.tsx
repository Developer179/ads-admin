'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Code2, Copy, Eye, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Button, Input } from './ui';

/**
 * Visual editor for an ad's customWidgetData. Two shapes are understood:
 *  - banner carousels  { titleImage, imageUrls: [{image,url,clickAction,…}] }
 *  - tile menus        { gradient: [c1,c2], tiles: [{id,title,subtitle,tag,tagColor,action,actionUrl,asset:{url},buttonTag,c,r,…}] }
 * Everything you don't edit is preserved byte-for-byte. Raw JSON stays available behind "Advanced".
 */

interface BannerItem {
  image?: string;
  url?: string;
  clickAction?: string;
  width?: number;
  height?: number;
  [k: string]: unknown;
}

interface TileItem {
  id?: string;
  title?: string;
  subtitle?: string;
  tag?: string;
  tagColor?: string;
  action?: string;
  actionUrl?: string;
  asset?: { url?: string; completeSize?: boolean;[k: string]: unknown };
  buttonTag?: { text?: string; textColor?: string; borderColor?: string;[k: string]: unknown };
  c?: number;
  r?: number;
  [k: string]: unknown;
}

export function WidgetEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState(value);
  const [rawError, setRawError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try {
      const p = JSON.parse(value);
      return p && typeof p === 'object' ? p : null;
    } catch {
      return null;
    }
  }, [value]);

  // Unparseable → raw editor only.
  if (!parsed) {
    return (
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={6} spellCheck={false}
        className="w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px] outline-none focus:border-brand-500" />
    );
  }

  const isTiles = Array.isArray(parsed.tiles);

  const commit = (mutate: (draft: any) => void) => {
    const draft = JSON.parse(JSON.stringify(parsed)); // unknown fields preserved
    mutate(draft);
    onChange(JSON.stringify(draft));
  };

  const applyRaw = () => {
    try {
      JSON.parse(raw);
      onChange(raw);
      setRawError(null);
      setAdvanced(false);
    } catch (e: any) {
      setRawError(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-600">{isTiles ? 'Tiles inside this menu' : 'Banners inside this widget'}</p>
        <button onClick={() => { setAdvanced(!advanced); setRaw(value); setRawError(null); }}
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
          {advanced ? <Eye className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
          {advanced ? 'Visual editor' : 'Advanced (JSON)'}
        </button>
      </div>

      {advanced ? (
        <div>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={10} spellCheck={false}
            className="w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px] outline-none focus:border-brand-500" />
          {rawError && <p className="mt-1 text-xs text-red-600">{rawError}</p>}
          <div className="mt-1 flex justify-end">
            <Button size="sm" variant="outline" onClick={applyRaw}>Apply JSON</Button>
          </div>
        </div>
      ) : isTiles ? (
        <TileMenuEditor data={parsed} commit={commit} />
      ) : (
        <BannersEditor data={parsed} commit={commit} />
      )}
    </div>
  );
}

// ---- tile menus (ADS_SUPER_MENU etc.) ---------------------------------------------------------------

function TileMenuEditor({ data, commit }: { data: any; commit: (mutate: (draft: any) => void) => void }) {
  const tiles: TileItem[] = data.tiles ?? [];
  const [selected, setSelected] = useState(0);
  const sel = Math.min(selected, Math.max(0, tiles.length - 1));
  const tile = tiles[sel];

  const setTile = (patch: Partial<TileItem>) => commit((d) => { d.tiles[sel] = { ...d.tiles[sel], ...patch }; });
  const setAsset = (url: string) => commit((d) => { d.tiles[sel] = { ...d.tiles[sel], asset: { ...(d.tiles[sel].asset ?? {}), url } }; });
  const setButton = (patch: Record<string, string>) =>
    commit((d) => { d.tiles[sel] = { ...d.tiles[sel], buttonTag: { ...(d.tiles[sel].buttonTag ?? {}), ...patch } }; });

  const move = (dir: -1 | 1) => {
    const j = sel + dir;
    if (j < 0 || j >= tiles.length) return;
    commit((d) => { [d.tiles[sel], d.tiles[j]] = [d.tiles[j], d.tiles[sel]]; });
    setSelected(j);
  };
  const duplicate = () => {
    commit((d) => {
      const copy = JSON.parse(JSON.stringify(d.tiles[sel]));
      copy.id = `${copy.id ?? 'tile'}_copy`;
      d.tiles.splice(sel + 1, 0, copy);
    });
    setSelected(sel + 1);
  };
  const remove = () => {
    commit((d) => { d.tiles.splice(sel, 1); });
    setSelected(Math.max(0, sel - 1));
  };
  const add = () => {
    commit((d) => { d.tiles.push({ id: `tile_${d.tiles.length + 1}`, title: 'New tile', asset: { url: '' }, c: 1, r: 1 }); });
    setSelected(tiles.length);
  };

  return (
    <div className="space-y-3">
      {/* gradient */}
      {Array.isArray(data.gradient) && data.gradient.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
          <div className="h-8 w-16 rounded-md border border-slate-200"
            style={{ background: `linear-gradient(135deg, ${data.gradient.join(', ')})` }} />
          <span className="text-xs font-medium text-slate-600">Menu background</span>
          {data.gradient.map((g: string, i: number) => (
            <ColorField key={i} value={g} onChange={(v) => commit((d) => { d.gradient[i] = v; })} />
          ))}
        </div>
      )}

      {/* the menu, exactly as the app lays it out — click a tile to edit it */}
      <div>
        <p className="mb-1.5 text-[11px] text-slate-400">This is the menu as the app shows it — click a tile to edit it.</p>
        <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-slate-200 p-2"
          style={Array.isArray(data.gradient) && data.gradient.length ? { background: `linear-gradient(135deg, ${data.gradient.join(', ')})` } : undefined}>
          {tiles.map((t, i) => (
            <button key={i} onClick={() => setSelected(i)}
              className={clsx('rounded-lg border bg-white/90 p-1.5 text-left transition',
                i === sel ? 'border-brand-500 ring-2 ring-brand-500' : 'border-slate-200 hover:border-slate-300')}
              style={{ gridColumn: `span ${Math.min(t.c ?? 1, 4)}`, gridRow: `span ${t.r ?? 1}` }}>
              <div className="flex h-10 w-full items-center justify-center overflow-hidden rounded bg-slate-50">
                {t.asset?.url
                  ? <img src={t.asset.url} alt="" className="max-h-full max-w-full object-contain" />
                  : <span className="text-[9px] text-slate-300">no image</span>}
              </div>
              <p className="mt-0.5 truncate text-[10px] font-medium text-slate-700">{t.title || t.id || `tile ${i + 1}`}</p>
              {t.subtitle && <p className="truncate text-[9px] text-slate-400">{t.subtitle}</p>}
              {t.tag && (
                <span className="mt-0.5 inline-block rounded-full px-1.5 text-[8px] font-semibold text-white"
                  style={{ backgroundColor: t.tagColor || '#64748b' }}>{t.tag}</span>
              )}
            </button>
          ))}
          <button onClick={add}
            className="flex min-h-[72px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/60 text-slate-400 hover:border-brand-400 hover:text-brand-600">
            <Plus className="h-4 w-4" />
            <span className="text-[9px]">add tile</span>
          </button>
        </div>
      </div>

      {/* the selected tile's controls */}
      {tile && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">
              Editing tile {sel + 1} of {tiles.length}
              <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">{tile.id}</span>
            </p>
            <div className="flex items-center gap-1">
              <TileBtn title="Move earlier" onClick={() => move(-1)} disabled={sel === 0}><ArrowLeft className="h-3.5 w-3.5" /></TileBtn>
              <TileBtn title="Move later" onClick={() => move(1)} disabled={sel === tiles.length - 1}><ArrowRight className="h-3.5 w-3.5" /></TileBtn>
              <TileBtn title="Duplicate this tile" onClick={duplicate}><Copy className="h-3.5 w-3.5" /></TileBtn>
              <TileBtn title="Delete this tile" onClick={remove} danger><Trash2 className="h-3.5 w-3.5" /></TileBtn>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="col-span-2 flex items-end gap-2">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                {tile.asset?.url ? <img src={tile.asset.url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[9px] text-slate-300">image</span>}
              </div>
              <div className="flex-1">
                <Input label="Image" value={tile.asset?.url ?? ''} onChange={(e) => setAsset(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <Input label="Title" value={tile.title ?? ''} onChange={(e) => setTile({ title: e.target.value })} />
            <Input label="Subtitle" value={tile.subtitle ?? ''} onChange={(e) => setTile({ subtitle: e.target.value })} />
            <Input label="Opens (link / screen)" value={tile.actionUrl ?? ''} onChange={(e) => setTile({ actionUrl: e.target.value })} placeholder="diwali-sale-home/payment" />
            <Input label="Action (developer)" value={tile.action ?? ''} onChange={(e) => setTile({ action: e.target.value })} placeholder="WEBVIEW / TRADE_BOARD / …" />
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input label="Corner tag (e.g. New)" value={tile.tag ?? ''} onChange={(e) => setTile({ tag: e.target.value })} />
              </div>
              <ColorField value={tile.tagColor ?? '#64748b'} onChange={(v) => setTile({ tagColor: v })} />
            </div>
            <div className="flex items-end gap-2">
              <SizeSelect label="Width" value={tile.c ?? 1} max={4} onChange={(v) => setTile({ c: v })} />
              <SizeSelect label="Height" value={tile.r ?? 1} max={2} onChange={(v) => setTile({ r: v })} />
            </div>
          </div>

          {tile.buttonTag !== undefined && (
            <details className="mt-2 rounded-lg bg-white px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-500">Button on the tile</summary>
              <div className="mt-2 flex items-end gap-2">
                <div className="flex-1">
                  <Input label="Button text" value={tile.buttonTag?.text ?? ''} onChange={(e) => setButton({ text: e.target.value })} />
                </div>
                <ColorField label="Text" value={tile.buttonTag?.textColor ?? '#000000'} onChange={(v) => setButton({ textColor: v })} />
                <ColorField label="Border" value={tile.buttonTag?.borderColor ?? '#000000'} onChange={(v) => setButton({ borderColor: v })} />
              </div>
            </details>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400">Anything not shown here (timers, flags…) is kept exactly as-is — use Advanced (JSON) for those.</p>
    </div>
  );
}

function TileBtn({ children, title, onClick, disabled, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className={clsx('rounded-md p-1.5 transition disabled:opacity-30',
        danger ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-500 hover:bg-white')}>
      {children}
    </button>
  );
}

function ColorField({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>}
      <span className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-1.5 py-1">
        <input type="color" value={safe} onChange={(e) => onChange(e.target.value)}
          className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input value={value} onChange={(e) => onChange(e.target.value)}
          className="w-[4.5rem] border-0 font-mono text-[11px] outline-none" />
      </span>
    </label>
  );
}

function SizeSelect({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-brand-500">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n} {n === 1 ? 'cell' : 'cells'}</option>
        ))}
      </select>
    </label>
  );
}

// ---- banner carousels (imageUrls) -------------------------------------------------------------------

function BannersEditor({ data, commit }: { data: any; commit: (mutate: (draft: any) => void) => void }) {
  const banners: BannerItem[] = Array.isArray(data.imageUrls) ? data.imageUrls : [];

  const setBanner = (i: number, patch: Partial<BannerItem>) =>
    commit((d) => { d.imageUrls[i] = { ...d.imageUrls[i], ...patch }; });
  const removeBanner = (i: number) =>
    commit((d) => { d.imageUrls.splice(i, 1); });
  const moveBanner = (i: number, dir: -1 | 1) =>
    commit((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.imageUrls.length) return;
      [d.imageUrls[i], d.imageUrls[j]] = [d.imageUrls[j], d.imageUrls[i]];
    });
  const addBanner = () =>
    commit((d) => {
      if (!Array.isArray(d.imageUrls)) d.imageUrls = [];
      d.imageUrls.push({ image: '', url: '', clickAction: 'WEBVIEW', width: 0, height: 0 });
    });

  return (
    <>
      {/* Title image */}
      {('titleImage' in data || data.titleImage === '') && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
          <div className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-50">
            {data.titleImage
              ? <img src={data.titleImage} alt="" className="max-h-full max-w-full object-contain" />
              : <span className="text-[9px] text-slate-300">no title img</span>}
          </div>
          <div className="flex-1">
            <Input label="Title image" value={data.titleImage ?? ''}
              onChange={(e) => commit((d) => { d.titleImage = e.target.value; })} placeholder="https://…" />
          </div>
        </div>
      )}

      {/* Banner items */}
      <div className="space-y-2">
        {banners.map((b, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-start gap-3">
              <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-50">
                {b.image
                  ? <img src={b.image} alt="" className="max-h-full max-w-full object-contain" />
                  : <span className="text-[9px] text-slate-300">no image</span>}
              </div>
              <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-3">
                <Input label="Image" value={b.image ?? ''} onChange={(e) => setBanner(i, { image: e.target.value })} placeholder="https://…" />
                <Input label="Opens (link / screen)" value={b.url ?? ''} onChange={(e) => setBanner(i, { url: e.target.value })} placeholder="earnings/all" />
                <Input label="Action (developer)" value={b.clickAction ?? ''} onChange={(e) => setBanner(i, { clickAction: e.target.value })} placeholder="WEBVIEW / PRO / …" />
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
                <button onClick={() => moveBanner(i, -1)} disabled={i === 0}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => moveBanner(i, 1)} disabled={i === banners.length - 1}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button onClick={() => removeBanner(i)} className="mt-1 text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" variant="outline" onClick={addBanner}><Plus className="h-3.5 w-3.5" /> Add banner</Button>
      <p className="text-[11px] text-slate-400">
        Everything else in the widget (timers, colors, counts) is preserved exactly as-is — use Advanced (JSON) to change those.
      </p>
    </>
  );
}
