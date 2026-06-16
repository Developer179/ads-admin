// Bidirectional conversion between the visual rule-builder tree and the backend predicate-DSL JSON,
// plus a humanizer that renders a predicate as plain English for non-engineers.

import { DslSchema } from './types';

export type Connector = 'and' | 'or';

export type RuleNode =
  | { kind: 'group'; connector: Connector; children: RuleNode[] }
  | { kind: 'not'; child: RuleNode }
  | { kind: 'leaf'; path: string; op: string; value: any };

export const EMPTY_GROUP: RuleNode = { kind: 'group', connector: 'and', children: [] };

const LOGICAL = new Set(['and', 'or', 'not']);

/** Builder tree -> DSL JSON object (or null for an empty/always-true rule). */
export function toDSL(node: RuleNode): any {
  if (node.kind === 'group') {
    if (node.children.length === 0) return null;
    return { [node.connector]: node.children.map(toDSL).filter((x) => x !== null) };
  }
  if (node.kind === 'not') {
    const inner = toDSL(node.child);
    return inner === null ? null : { not: inner };
  }
  // leaf
  if (node.op === '==') return { [node.path]: node.value };
  if (node.op === 'in' && Array.isArray(node.value)) return { [node.path]: node.value };
  if (node.op === 'is_null' || node.op === 'is_not_null') return { op: node.op, path: node.path };
  return { op: node.op, path: node.path, value: node.value };
}

/** DSL JSON object -> builder tree. Best-effort; unknown shapes become an empty group. */
export function fromDSL(dsl: any): RuleNode {
  if (dsl == null || typeof dsl !== 'object') return { ...EMPTY_GROUP };
  if (Array.isArray(dsl.and)) return { kind: 'group', connector: 'and', children: dsl.and.map(fromDSL) };
  if (Array.isArray(dsl.or)) return { kind: 'group', connector: 'or', children: dsl.or.map(fromDSL) };
  if (dsl.not !== undefined) return { kind: 'not', child: fromDSL(dsl.not) };
  if (dsl.op !== undefined) {
    const path = typeof dsl.path === 'string' ? dsl.path : JSON.stringify(dsl.path);
    return { kind: 'leaf', path, op: dsl.op, value: dsl.value };
  }
  // sugar leaf { "path": value }
  const keys = Object.keys(dsl).filter((k) => !LOGICAL.has(k));
  if (keys.length === 1) {
    const path = keys[0];
    const value = dsl[path];
    return { kind: 'leaf', path, op: Array.isArray(value) ? 'in' : '==', value };
  }
  return { ...EMPTY_GROUP };
}

export function parseExpr(expr?: string | null): RuleNode {
  if (!expr || !expr.trim()) return { ...EMPTY_GROUP };
  try {
    return fromDSL(JSON.parse(expr));
  } catch {
    return { ...EMPTY_GROUP };
  }
}

export function stringifyExpr(node: RuleNode): string {
  const dsl = toDSL(node);
  return dsl === null ? '' : JSON.stringify(dsl);
}

const OP_PHRASE: Record<string, string> = {
  '==': 'is', '!=': 'is not', '>': 'is more than', '>=': 'is at least',
  '<': 'is less than', '<=': 'is at most', in: 'is one of', not_in: 'is not one of',
  between: 'is between', is_null: 'is not set', is_not_null: 'is set',
  contains: 'contains', starts_with: 'starts with', regex: 'matches',
};

/** Render a predicate as plain English using the schema's friendly labels. */
export function humanize(node: RuleNode, schema?: DslSchema | null): string {
  if (node.kind === 'group') {
    if (node.children.length === 0) return 'everyone';
    const joiner = node.connector === 'and' ? ' AND ' : ' OR ';
    const parts = node.children.map((c) => {
      const s = humanize(c, schema);
      return c.kind === 'group' && c.children.length > 1 ? `(${s})` : s;
    });
    return parts.join(joiner);
  }
  if (node.kind === 'not') return `NOT (${humanize(node.child, schema)})`;

  const label = schema?.paths.find((p) => p.path === node.path)?.label ?? node.path;
  const phrase = OP_PHRASE[node.op] ?? node.op;
  if (node.op === 'is_null' || node.op === 'is_not_null') return `${label} ${phrase}`;
  const val = Array.isArray(node.value) ? node.value.join(', ') : String(node.value);
  return `${label} ${phrase} ${val}`;
}

export function ruleSummary(expr?: string | null, schema?: DslSchema | null): string {
  if (!expr || !expr.trim()) return 'everyone';
  return humanize(parseExpr(expr), schema);
}
