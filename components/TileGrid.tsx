'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { SuperMenuTile } from '@/lib/types';
import { Badge, Button, useToast } from './ui';

/** A tile as it appears inside an ad's customWidgetData. */
export interface WidgetTile {
  id?: string;
  title?: string;
  subtitle?: string;
  tag?: string;
  asset?: { url?: string };
  c?: number;
  r?: number;
}

export function parseTiles(customWidgetData?: string | null): WidgetTile[] | null {
  if (!customWidgetData) return null;
  try {
    const parsed = JSON.parse(customWidgetData);
    return Array.isArray(parsed?.tiles) && parsed.tiles.length > 0 ? parsed.tiles : null;
  } catch {
    return null;
  }
}

/**
 * Renders a super-menu's tiles the way the app lays them out (col/row spans) and gives each tile its own
 * show/hide switch. Hidden tiles (filtered out of the served menu by the backend) are shown greyed so they
 * can be re-enabled. "Sync" registers control rows for every tile currently served to the sample user.
 */
export function TileGrid({ menuLocation, servedTiles, sampleUserId }: {
  menuLocation: string; servedTiles: WidgetTile[]; sampleUserId?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const rowsQ = useQuery({ queryKey: ['tiles'], queryFn: () => api.listTiles(true) });
  const rows = (rowsQ.data ?? []).filter((t) => t.menuLocation === menuLocation);
  const rowByTileId = new Map(rows.map((t) => [t.tileId, t]));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tiles'] });
    qc.invalidateQueries({ queryKey: ['preview'] });
  };
  const toggle = useMutation({
    mutationFn: async ({ tile, visible }: { tile: WidgetTile; visible: boolean }) => {
      const existing = tile.id ? rowByTileId.get(tile.id) : undefined;
      if (existing?.id) return api.updateTile(existing.id, { ...existing, visible });
      return api.createTile({
        menuLocation, tileId: tile.id ?? '', configModule: tile.id ?? '',
        colSpan: tile.c ?? 1, rowSpan: tile.r ?? 1, tileOrder: 999, active: true, visible,
      });
    },
    onSuccess: (_d, v) => { invalidate(); toast('success', v.visible ? 'Tile is showing again' : 'Tile hidden'); },
    onError: (e) => toast('error', (e as Error).message),
  });
  const showRow = useMutation({
    mutationFn: (row: SuperMenuTile) => api.updateTile(row.id!, { ...row, visible: true }),
    onSuccess: () => { invalidate(); toast('success', 'Tile is showing again'); },
    onError: (e) => toast('error', (e as Error).message),
  });
  const sync = useMutation({
    mutationFn: () => api.syncTiles(Number(sampleUserId)),
    onSuccess: invalidate,
    onError: (e) => toast('error', (e as Error).message),
  });

  // Hidden tiles are absent from the served menu — surface them from their control rows so they can come back.
  const servedIds = new Set(servedTiles.map((t) => t.id));
  const hiddenRows = rows.filter((r) => !r.visible && !servedIds.has(r.tileId));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">
          Tiles inside this menu — each one can be hidden individually (menu keeps serving the rest)
        </p>
        {sampleUserId && (
          <Button size="sm" variant="ghost" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className="h-3 w-3" /> {sync.isPending ? 'Syncing…' : 'Sync tiles'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {servedTiles.map((tile, i) => {
          const row = tile.id ? rowByTileId.get(tile.id) : undefined;
          const visible = row ? !!row.visible : true;
          return (
            <div key={tile.id ?? i}
              className={`relative overflow-hidden rounded-lg border p-2 ${visible ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50 opacity-70'}`}
              style={{ gridColumn: `span ${Math.min(tile.c ?? 1, 4)}`, gridRow: `span ${tile.r ?? 1}` }}>
              {tile.asset?.url && (
                <div className="mb-1 flex h-16 w-full items-center justify-center overflow-hidden rounded bg-slate-50">
                  <img src={tile.asset.url} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              )}
              <p className="truncate text-[11px] font-medium text-slate-700">{tile.title || tile.id}</p>
              {tile.subtitle && <p className="truncate text-[10px] text-slate-400">{tile.subtitle}</p>}
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-[9px] text-slate-300">{tile.id}</span>
                <button
                  onClick={() => toggle.mutate({ tile, visible: !visible })}
                  className={visible ? 'text-green-600 hover:text-red-500' : 'text-amber-600 hover:text-green-600'}
                  title={visible ? 'Hide this tile' : 'Show this tile'}>
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          );
        })}

        {hiddenRows.map((row) => (
          <div key={`hidden-${row.id}`}
            className="relative rounded-lg border border-dashed border-red-300 bg-red-50/50 p-2 opacity-80"
            style={{ gridColumn: `span ${Math.min(row.colSpan ?? 1, 4)}` }}>
            <p className="truncate text-[11px] font-medium text-red-700">{row.tileId}</p>
            <div className="mt-1 flex items-center justify-between">
              <Badge color="red">hidden</Badge>
              <button
                onClick={() => row.id && showRow.mutate(row)} disabled={showRow.isPending}
                className="text-red-500 hover:text-green-600 disabled:opacity-40" title="Show this tile again">
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {toggle.isError && <p className="mt-1 text-xs text-red-600">{(toggle.error as Error).message}</p>}
    </div>
  );
}
