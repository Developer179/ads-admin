'use client';

import { useEffect, useState } from 'react';

/**
 * Which app surface ("module") the Live App View is simulating. The backend ad engine is module-generic —
 * the same rules/layout/toggle/preview endpoints serve any module — so the dashboard is parameterised by this.
 *
 *  - EXPLORE   : the home/Explore screen. One scrolling feed ordered by HomeScreenWidgetOrder (preview.widgetOrder).
 *  - TRADECARD : the Trade Board screen (Flutter UnivestAdApiConstantc.tradeCardAds = 'TRADECARD'). A tabbed screen
 *                whose sub-tabs differ by whether the viewer is PAID or UNPAID (mirrors circles_tab_controller):
 *                  paid   → Overview, Stocks, Futures, Options (+ Commodity)   [tradeCardSequence]
 *                  unpaid → Overview, Live Trades, Closed Trades (+ Commodity) [unpaidUserTermSequence]
 */
export type ModuleKey = 'EXPLORE' | 'TRADECARD';

export interface SubTab {
  id: string;
  label: string;
  /** ordered ad-location keys that fill this sub-tab (kept in sync with the seed migration). */
  locations: string[];
}

export interface ModuleDef {
  key: ModuleKey;
  /** adType used for the layout-control toggle. */
  layoutKey: string;
  /** short label (bottom-nav). */
  label: string;
  /** label shown at the top of the phone frame. */
  screenLabel: string;
  /** EXPLORE drives order from preview.widgetOrder; tabbed modules drive it from the active sub-tab. */
  usesWidgetOrder: boolean;
  /** tabbed modules only: sub-tabs by audience (mirrors the real app's paid vs unpaid tab sets). */
  audienceTabs?: { paid: SubTab[]; unpaid: SubTab[] };
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  EXPLORE: {
    key: 'EXPLORE',
    layoutKey: 'EXPLORE_LAYOUT',
    label: 'Explore',
    screenLabel: 'Explore',
    usesWidgetOrder: true,
  },
  TRADECARD: {
    key: 'TRADECARD',
    layoutKey: 'TRADECARD_LAYOUT',
    label: 'Trades',
    screenLabel: 'Trade Board',
    usesWidgetOrder: false,
    audienceTabs: {
      paid: [
        {
          id: 'overview',
          label: 'Overview',
          locations: [
            'TradeBoardHomeCustomAdsForPaidUser1',
            'TradeBoardHomeCustomAdsForPaidUser2',
            'TradeBoardHomeCustomAdsForPaidUser3',
            'TradeBoardHomeCustomAdsIdeaSegment',
            'TRADE_CARD_MID_AD',
          ],
        },
        { id: 'stocks', label: 'Stocks', locations: ['TRADE_STOCK', 'TRADE_STOCK_2', 'EMPTY_STOCK'] },
        { id: 'futures', label: 'Futures', locations: ['TRADE_FUTURES', 'TRADE_FUTURES_2', 'EMPTY_FUTURES'] },
        { id: 'options', label: 'Options', locations: ['TRADE_OPTIONS', 'TRADE_OPTIONS_2', 'EMPTY_OPTIONS'] },
        { id: 'commodity', label: 'Commodity', locations: ['TRADE_COMMODITY', 'TRADE_COMMODITY_2', 'EMPTY_COMMODITY'] },
      ],
      unpaid: [
        {
          id: 'overview',
          label: 'Overview',
          locations: ['TRADE_HOME_TOP', 'TRADE_HOME_MID', 'TRADE_HOME_BOTTOM', 'TradeBoardHomeCustomAdsIdeaSegment', 'TRADE_CARD_MID_AD'],
        },
        { id: 'live', label: 'Live Trades', locations: ['TRADE_ACTIVE', 'TRADE_ACTIVE_2', 'TRADE_ACTIVE_BOTTOM', 'EMPTY_ACTIVE'] },
        { id: 'closed', label: 'Closed Trades', locations: ['UNPAID_CLOSED'] },
        { id: 'commodity', label: 'Commodity', locations: ['TRADE_COMMODITY', 'TRADE_COMMODITY_2', 'EMPTY_COMMODITY'] },
      ],
    },
  },
};

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

export type Audience = 'paid' | 'unpaid';

/** The active sub-tab set for a module given the viewer's audience (empty for non-tabbed modules). */
export function subTabsFor(def: ModuleDef, audience: Audience): SubTab[] {
  return def.audienceTabs ? def.audienceTabs[audience] : [];
}

/** Every location across BOTH audience tab-sets — used to compute "other served spots" (off-tab extras). */
export function allTabLocations(def: ModuleDef): Set<string> {
  if (!def.audienceTabs) return new Set();
  return new Set([...def.audienceTabs.paid, ...def.audienceTabs.unpaid].flatMap((t) => t.locations));
}

/**
 * The app's bottom navigation bar, mirrored in the phone simulation. Only Explore + Trades are wired to ad
 * modules right now; the rest are shown FADED ("not wired yet"). `icon` is a key mapped to a lucide icon in the UI.
 */
export interface NavTab {
  id: string;
  label: string;
  icon: 'home' | 'wallet' | 'idea' | 'eye' | 'wrench';
  module: ModuleKey | null; // null = not wired yet (faded)
}

export const NAV_TABS: NavTab[] = [
  { id: 'explore', label: 'Explore', icon: 'home', module: 'EXPLORE' },
  { id: 'demat', label: 'Demat', icon: 'wallet', module: null },
  { id: 'trades', label: 'Trades', icon: 'idea', module: 'TRADECARD' },
  { id: 'watchlist', label: 'Watchlist', icon: 'eye', module: null },
  { id: 'freeTools', label: 'Free Tools', icon: 'wrench', module: null },
];

const KEY = 'explore-admin:module';

function isModuleKey(v: unknown): v is ModuleKey {
  return v === 'EXPLORE' || v === 'TRADECARD';
}

/**
 * Global "which module" selector, persisted in localStorage so the feed's bottom-nav choice carries to the
 * engine/overview pages. Driven by the phone bottom-nav (no sidebar switcher).
 */
export function useModule(): [ModuleKey, (m: ModuleKey) => void] {
  const [mod, setMod] = useState<ModuleKey>('EXPLORE');
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (isModuleKey(saved)) setMod(saved);
  }, []);
  const update = (m: ModuleKey) => {
    setMod(m);
    localStorage.setItem(KEY, m);
  };
  return [mod, update];
}
