// Slot-chain semantics shared by the Live App View.
//
// Backend resolution per location: rules sorted by priority ASC, first ACTIVE rule whose predicate
// matches wins. Winner visible=false → location serves NOTHING. Winner with no asset → passthrough
// (production logic serves). We layer three well-known rule shapes on top of that:
//
//   KILL  (priority 0,   no asset, no predicate, hidden) → slot is OFF for everyone
//   custom (priority ~90, asset bound, optional predicate) → the ad you authored
//   BLOCK (priority 995,  no asset, no predicate, hidden) → users who didn't match any custom rule
//                                                           see NOTHING instead of production default
//   passthrough (priority 1000, no asset, no predicate, visible) → production default (seeded)

import { AdRule } from './types';

export const KILL_PRIORITY = 0;
export const BLOCK_PRIORITY = 995;
export const PASSTHROUGH_PRIORITY = 1000;

const noAsset = (r: AdRule) => r.adsId == null && r.variantId == null;

export const isPassthroughRule = (r: AdRule) => noAsset(r) && r.ruleId == null && r.visible !== false;
export const isKillRule = (r: AdRule) => noAsset(r) && r.ruleId == null && r.visible === false && (r.priority ?? 0) <= KILL_PRIORITY;
export const isBlockRule = (r: AdRule) => noAsset(r) && r.ruleId == null && r.visible === false && r.priority === BLOCK_PRIORITY;
export const isCustomRule = (r: AdRule) => !noAsset(r);

/** This location's rules in serve order (priority asc). */
export function chainFor(rules: AdRule[], location: string): AdRule[] {
  return rules
    .filter((r) => r.location === location)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

/** Active kill rule → the slot is hidden for everyone. */
export function activeKill(chain: AdRule[]): AdRule | undefined {
  return chain.find((r) => r.active && isKillRule(r));
}

/** Active block rule → non-matching users see nothing (instead of production default). */
export function activeBlock(chain: AdRule[]): AdRule | undefined {
  return chain.find((r) => r.active && isBlockRule(r));
}

/** Active custom rules (your authored ads), serve order. */
export function customRules(chain: AdRule[]): AdRule[] {
  return chain.filter((r) => r.active && isCustomRule(r));
}

/** Priority for a NEW custom rule: above existing customs' floor, always above BLOCK/passthrough. */
export function nextCustomPriority(chain: AdRule[]): number {
  const customs = chain.filter(isCustomRule).map((r) => r.priority ?? 100);
  const min = customs.length ? Math.min(...customs) : 100;
  return Math.max(1, Math.min(min - 10, 90));
}
