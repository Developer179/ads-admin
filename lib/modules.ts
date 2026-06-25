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
export type ModuleKey =
  | 'EXPLORE'
  | 'TRADECARD'
  // Payment / checkout surfaces. Each is a distinct {adType} the app fetches via getAdsSize, so each gets its
  // own engine toggle + rules. They are "flat" modules (no widget-order, no audience sub-tabs): the phone
  // preview renders whatever locations the live serving path returns for the user, in order.
  | 'PAYMENT_SHEET'
  | 'TRIAL_PAYMENT_PAGE'
  | 'BASKET_PAYMENT_PAGE'
  | 'MF_PAYMENT_PAGE'
  | 'COMMODITY_SUBSCRIPTION_AD_PAGE'
  | 'PAYMENT_INVESTMENT_SUMMERY';

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
    // Tabs mirror the real CirclesTabController (circles_tab_controller.dart). Both sets always lead with
    // Overview; the rest are data-driven in the app (paid: tradeCardSequence; unpaid: commodityEnabled).
    // Commodity is CONDITIONAL — the feed page only shows it when commodity ads are actually served to the
    // previewed user. EMPTY_* slots only render in the app when that tab has zero trades (empty-state only).
    audienceTabs: {
      paid: [
        // Overview shows the three paid custom-ad slots in app order (User3 above 'Ideas by segment', then User1, User2).
        { id: 'overview', label: 'Overview', locations: ['TradeBoardHomeCustomAdsForPaidUser3', 'TradeBoardHomeCustomAdsForPaidUser1', 'TradeBoardHomeCustomAdsForPaidUser2'] },
        { id: 'stocks', label: 'Stocks', locations: ['TRADE_STOCK', 'EMPTY_STOCK'] },
        { id: 'futures', label: 'Futures', locations: ['TRADE_FUTURES', 'EMPTY_FUTURES'] },
        { id: 'options', label: 'Options', locations: ['TRADE_OPTIONS', 'EMPTY_OPTIONS'] },
        { id: 'commodity', label: 'Commodity', locations: ['TRADE_COMMODITY', 'EMPTY_COMMODITY'] },
      ],
      unpaid: [
        { id: 'overview', label: 'Overview', locations: ['TRADE_HOME_TOP', 'TRADE_HOME_MID', 'TRADE_HOME_BOTTOM'] },
        { id: 'live', label: 'Live Trades', locations: ['TRADE_ACTIVE', 'EMPTY_ACTIVE'] },
        { id: 'closed', label: 'Closed Trades', locations: ['UNPAID_CLOSED'] },
        { id: 'commodity', label: 'Commodity', locations: ['TRADE_COMMODITY', 'EMPTY_COMMODITY'] },
      ],
    },
  },

  // ---- Payment / checkout surfaces (flat modules — preview renders the served locations in order) -------
  PAYMENT_SHEET: {
    key: 'PAYMENT_SHEET', layoutKey: 'PAYMENT_SHEET_LAYOUT',
    label: 'PRO Checkout', screenLabel: 'PRO Payment', usesWidgetOrder: false,
  },
  TRIAL_PAYMENT_PAGE: {
    key: 'TRIAL_PAYMENT_PAGE', layoutKey: 'TRIAL_PAYMENT_PAGE_LAYOUT',
    label: 'Trial Checkout', screenLabel: 'Trial Payment', usesWidgetOrder: false,
  },
  BASKET_PAYMENT_PAGE: {
    key: 'BASKET_PAYMENT_PAGE', layoutKey: 'BASKET_PAYMENT_PAGE_LAYOUT',
    label: 'Basket Checkout', screenLabel: 'Basket Payment', usesWidgetOrder: false,
  },
  MF_PAYMENT_PAGE: {
    key: 'MF_PAYMENT_PAGE', layoutKey: 'MF_PAYMENT_PAGE_LAYOUT',
    label: 'MF Checkout', screenLabel: 'Mutual Fund Payment', usesWidgetOrder: false,
  },
  COMMODITY_SUBSCRIPTION_AD_PAGE: {
    key: 'COMMODITY_SUBSCRIPTION_AD_PAGE', layoutKey: 'COMMODITY_SUBSCRIPTION_AD_PAGE_LAYOUT',
    label: 'Commodity Sub', screenLabel: 'Commodity Subscription', usesWidgetOrder: false,
  },
  PAYMENT_INVESTMENT_SUMMERY: {
    key: 'PAYMENT_INVESTMENT_SUMMERY', layoutKey: 'PAYMENT_INVESTMENT_SUMMERY_LAYOUT',
    label: 'Invest. Summary', screenLabel: 'Investment Summary', usesWidgetOrder: false,
  },
};

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/** Grouping for the screen picker: the two live app screens, then the payment / checkout surfaces. */
export const MODULE_GROUPS: { label: string; modules: ModuleKey[] }[] = [
  { label: 'App screens', modules: ['EXPLORE', 'TRADECARD'] },
  {
    label: 'Payment & checkout',
    modules: [
      'PAYMENT_SHEET', 'TRIAL_PAYMENT_PAGE', 'BASKET_PAYMENT_PAGE',
      'MF_PAYMENT_PAGE', 'COMMODITY_SUBSCRIPTION_AD_PAGE', 'PAYMENT_INVESTMENT_SUMMERY',
    ],
  },
];

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
  return typeof v === 'string' && v in MODULES;
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
