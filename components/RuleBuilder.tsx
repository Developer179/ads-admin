'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Plus, Trash2, Code2, Eye } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { Connector, RuleNode, parseExpr, stringifyExpr, humanize } from '@/lib/dsl';
import { DslSchema, SchemaPath } from '@/lib/types';
import { Button } from './ui';

/**
 * Visual predicate-DSL builder. Emits the raw expr JSON string via onChange. Supports an Advanced (raw JSON)
 * mode for power users / fn.* expressions the visual builder doesn't model.
 */
export function RuleBuilder({ expr, onChange }: { expr: string; onChange: (expr: string) => void }) {
  const schema = useQuery({ queryKey: ['schema'], queryFn: () => api.schema() });
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState(expr);
  const [rawError, setRawError] = useState<string | null>(null);

  const tree = useMemo(() => parseExpr(expr), [expr]);

  const update = (next: RuleNode) => onChange(stringifyExpr(next));

  const applyRaw = () => {
    if (!raw.trim()) { onChange(''); setRawError(null); return; }
    try { JSON.parse(raw); onChange(raw); setRawError(null); }
    catch (e: any) { setRawError(e.message); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">
          Targeting rule — <span className="text-slate-700">{humanize(tree, schema.data)}</span>
        </p>
        <button
          onClick={() => { setAdvanced(!advanced); setRaw(expr); }}
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
          {advanced ? <Eye className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
          {advanced ? 'Visual' : 'Advanced JSON'}
        </button>
      </div>

      {advanced ? (
        <div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={applyRaw}
            rows={6}
            spellCheck={false}
            placeholder='{"and":[{"user.isPaid":false},{"device.os":"android"}]}'
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-brand-500"
          />
          {rawError && <p className="mt-1 text-xs text-red-600">{rawError}</p>}
          <p className="mt-1 text-[11px] text-slate-400">Leave blank to match everyone. Supports fn.* and nested groups.</p>
        </div>
      ) : (
        <GroupEditor
          node={tree.kind === 'group' ? tree : { kind: 'group', connector: 'and', children: [tree] }}
          schema={schema.data} onChange={update} depth={0} />
      )}
    </div>
  );
}

function GroupEditor({ node, schema, onChange, depth }: {
  node: Extract<RuleNode, { kind: 'group' }>; schema?: DslSchema; onChange: (n: RuleNode) => void; depth: number;
}) {
  const setChild = (i: number, child: RuleNode) => {
    const children = [...node.children]; children[i] = child; onChange({ ...node, children });
  };
  const removeChild = (i: number) => onChange({ ...node, children: node.children.filter((_, j) => j !== i) });
  const addLeaf = () => onChange({ ...node, children: [...node.children, defaultLeaf(schema)] });
  const addGroup = () => onChange({ ...node, children: [...node.children, { kind: 'group', connector: 'and', children: [] }] });

  return (
    <div className={clsx('rounded-lg border p-3', depth === 0 ? 'border-slate-200' : 'border-l-2 border-brand-200 bg-slate-50')}>
      <div className="mb-2 flex items-center gap-2">
        <select
          value={node.connector}
          onChange={(e) => onChange({ ...node, connector: e.target.value as Connector })}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold">
          <option value="and">ALL of</option>
          <option value="or">ANY of</option>
        </select>
        <span className="text-xs text-slate-400">the following match</span>
      </div>

      <div className="space-y-2">
        {node.children.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              {c.kind === 'group'
                ? <GroupEditor node={c} schema={schema} onChange={(n) => setChild(i, n)} depth={depth + 1} />
                : <LeafEditor node={c.kind === 'leaf' ? c : defaultLeaf(schema)} schema={schema} onChange={(n) => setChild(i, n)} />}
            </div>
            <button onClick={() => removeChild(i)} className="mt-1 text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={addLeaf}><Plus className="h-3 w-3" /> Condition</Button>
        {depth < 2 && <Button size="sm" variant="ghost" onClick={addGroup}><Plus className="h-3 w-3" /> Group</Button>}
      </div>
    </div>
  );
}

/** A committed default of the right TYPE for a path/op — never an uncommitted '' that a <select> merely displays over. */
function defaultValueFor(meta: SchemaPath | undefined, op: string): any {
  if (op === 'in' || op === 'not_in') return [];
  if (meta?.type === 'boolean') return true;
  if (meta?.type === 'enum') return meta.enum?.[0] ?? '';
  if (meta?.type === 'number') return 0;
  return '';
}

function LeafEditor({ node, schema, onChange }: {
  node: Extract<RuleNode, { kind: 'leaf' }>; schema?: DslSchema; onChange: (n: RuleNode) => void;
}) {
  const paths = schema?.paths ?? [];
  const meta: SchemaPath | undefined = paths.find((p) => p.path === node.path);
  const ops = meta?.operators ?? ['==', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'contains', 'is_null', 'is_not_null'];
  const noValue = node.op === 'is_null' || node.op === 'is_not_null';

  const changePath = (path: string) => {
    const m = paths.find((p) => p.path === path);
    const op = m?.operators?.includes(node.op) ? node.op : (m?.operators?.[0] ?? '==');
    onChange({ kind: 'leaf', path, op, value: defaultValueFor(m, op) });
  };
  const changeOp = (op: string) => {
    const multi = op === 'in' || op === 'not_in';
    const wasMulti = Array.isArray(node.value);
    let value = node.value;
    if (multi && !wasMulti) value = node.value === '' || node.value == null ? [] : [node.value];
    else if (!multi && wasMulti) value = (node.value as any[])[0] ?? defaultValueFor(meta, op);
    else if (op === 'is_null' || op === 'is_not_null') value = undefined;
    else if (value === '' || value == null) value = defaultValueFor(meta, op);
    onChange({ ...node, op, value });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
      <select value={node.path} onChange={(e) => changePath(e.target.value)}
        className="min-w-[150px] rounded-md border border-slate-300 px-2 py-1 text-xs">
        {!meta && <option value={node.path}>{node.path}</option>}
        {paths.map((p) => <option key={p.path} value={p.path}>{p.label} ({p.path})</option>)}
      </select>

      <select value={node.op} onChange={(e) => changeOp(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs">
        {ops.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>

      {!noValue && <ValueInput meta={meta} op={node.op} value={node.value} onChange={(v) => onChange({ ...node, value: v })} />}
    </div>
  );
}

function ValueInput({ meta, op, value, onChange }: {
  meta?: SchemaPath; op: string; value: any; onChange: (v: any) => void;
}) {
  const multi = op === 'in' || op === 'not_in';
  if (meta?.type === 'boolean') {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value === 'true')}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs">
        <option value="true">true</option><option value="false">false</option>
      </select>
    );
  }
  if (meta?.type === 'enum' && meta.enum && !multi) {
    return (
      <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs">
        {meta.enum.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  if (multi) {
    const text = Array.isArray(value) ? value.join(', ') : '';
    return (
      <input value={text} placeholder="comma,separated"
        onChange={(e) => onChange(e.target.value.split(',').map((s) => coerce(s.trim(), meta)).filter((s) => s !== ''))}
        className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
    );
  }
  const isNum = meta?.type === 'number';
  return (
    <input type={isNum ? 'number' : 'text'} value={value ?? ''}
      onChange={(e) => onChange(isNum ? Number(e.target.value) : e.target.value)}
      className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
  );
}

function coerce(s: string, meta?: SchemaPath): any {
  if (meta?.type === 'number') { const n = Number(s); return Number.isNaN(n) ? s : n; }
  return s;
}

type LeafNode = Extract<RuleNode, { kind: 'leaf' }>;

function defaultLeaf(schema?: DslSchema): LeafNode {
  const p = schema?.paths[0];
  const op = p?.operators[0] ?? '==';
  return { kind: 'leaf', path: p?.path ?? 'user.isPaid', op, value: defaultValueFor(p, op) };
}
