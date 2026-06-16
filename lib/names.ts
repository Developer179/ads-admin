// Plain-English names for every spot on the Explore screen. The app/backend use code keys
// (TOP_DROP_OFF_AD, ADS_SUPER_MENU…) — people shouldn't have to. Unknown keys get auto-prettified.

const NAMES: Record<string, { name: string; hint?: string }> = {
  // top of screen
  MARKET_INDICES_HEADER: { name: 'Market indices strip', hint: 'Nifty / Sensex ticker at the very top' },
  TOP_EDUCATION_AD: { name: 'Education banner (top)' },
  TOP_DROP_OFF_AD: { name: 'Main top banner', hint: 'the big banner right at the top' },
  DIWALI_TOP_AD: { name: 'Festive top banner' },
  ABOVE_MENU_AD: { name: 'Banner above the menu' },
  MENU_ICONS: { name: 'Main menu icons' },
  ADS_SUPER_MENU: { name: 'Quick-actions tile menu', hint: 'the grid of tappable tiles' },
  DEMAT_ADS_SUPER_MENU: { name: 'Demat quick-actions menu' },

  // middle
  BUDGET_FOR_NEW_USER_AD: { name: 'New-user budget banner' },
  MANDIR_WALA_AD: { name: 'Mandir campaign banner' },
  PAID_DIWALI_AD_1: { name: 'Festive banner 1 · paid users' },
  UNPAID_DIWALI_AD_1: { name: 'Festive banner 1 · free users' },
  PAID_DIWALI_AD_1_IOS: { name: 'Festive banner 1 · paid · iPhone' },
  UNPAID_DIWALI_AD_1_IOS: { name: 'Festive banner 1 · free · iPhone' },
  PAID_DIWALI_AD_2: { name: 'Festive banner 2 · paid users' },
  UNPAID_DIWALI_AD_2: { name: 'Festive banner 2 · free users' },
  MARKET_ADS_CUSTOM_WIDGET_NO_TIMER: { name: 'Market banner carousel' },
  PAST_PERFORMANCE_WIDGET: { name: 'Past performance section' },
  MINI_TRADE_CARDS: { name: 'Mini trade cards' },
  TRADE_CARDS: { name: 'Trade cards' },
  FREE_RESEARCH_TOOL: { name: 'Free research tools' },
  RESEARCH_IDEA_WIDGET: { name: 'Research ideas' },
  SCREENER_CUSTOM_WIDGET: { name: 'Screeners widget' },
  RESULT_CUSTOM_WIDGET: { name: 'Results widget' },
  COMMON_AD_TWO_TILE: { name: 'Two-tile banner' },
  COMMON_AD_FOUR_TILE: { name: 'Four-tile banner' },
  COMMON_AD_TWO_TILE_NEW1: { name: 'Two-tile banner (new)' },
  COMMON_AD_FOUR_TILE_NEW: { name: 'Four-tile banner (new)' },
  PRO_AD_TOP_1: { name: 'Pro banner 1' },
  PRO_AD_TOP_2: { name: 'Pro banner 2' },
  PRO_AD_TOP_3: { name: 'Pro banner 3' },

  // not part of the scroll
  DISCOVER_TOP_AD: { name: 'Discover tab · top banner' },
  BOTTOMSHEET_AD: { name: 'Bottom pop-up' },
  HOME_SILENT_AD: { name: 'Invisible background action', hint: 'no visual — triggers something silently' },

  // ---- Trade Board (TRADECARD) ----
  // Overview
  TRADE_HOME_TOP: { name: 'Overview · top banner', hint: 'top of the Trade Board (free users)' },
  TRADE_HOME_MID: { name: 'Overview · middle banner' },
  TRADE_HOME_BOTTOM: { name: 'Overview · bottom banner' },
  TRADE_HOME_BOTTOM_MF: { name: 'Overview · bottom banner (MF users)' },
  TradeBoardHomeCustomAdsForPaidUser1: { name: 'Overview · paid banner 1', hint: 'shown to paid users' },
  TradeBoardHomeCustomAdsForPaidUser2: { name: 'Overview · paid banner 2', hint: 'shown to paid users' },
  TradeBoardHomeCustomAdsForPaidUser3: { name: 'Overview · paid banner 3', hint: 'shown to paid users' },
  TradeBoardHomeCustomAdsForPaidUser1MF: { name: 'Overview · paid banner 1 (MF users)' },
  TradeBoardHomeCustomAdsIdeaSegment: { name: 'Overview · idea segment banner' },
  // Per-tab
  TRADE_STOCK: { name: 'Stocks · banner' },
  TRADE_STOCK_2: { name: 'Stocks · banner 2' },
  EMPTY_STOCK: { name: 'Stocks · empty-state banner', hint: 'shown when there are no stock trades' },
  TRADE_FUTURES: { name: 'Futures · banner' },
  TRADE_FUTURES_2: { name: 'Futures · banner 2' },
  EMPTY_FUTURES: { name: 'Futures · empty-state banner' },
  TRADE_OPTIONS: { name: 'Options · banner' },
  TRADE_OPTIONS_2: { name: 'Options · banner 2' },
  EMPTY_OPTIONS: { name: 'Options · empty-state banner' },
  TRADE_COMMODITY: { name: 'Commodity · banner' },
  TRADE_COMMODITY_2: { name: 'Commodity · banner 2' },
  EMPTY_COMMODITY: { name: 'Commodity · empty-state banner' },
  // Live trades / active
  TRADE_ACTIVE: { name: 'Live Trades · banner' },
  TRADE_ACTIVE_2: { name: 'Live Trades · banner 2' },
  TRADE_ACTIVE_BOTTOM: { name: 'Live Trades · bottom banner' },
  EMPTY_ACTIVE: { name: 'Live Trades · empty-state banner' },
  UNPAID_CLOSED: { name: 'Live Trades · closed-trades banner', hint: 'shown to free users on closed trades' },
  TRADE_CARD_MID_AD: { name: 'Between trade cards', hint: 'interleaved after a few cards' },
};

const SENTINELS = new Set(['ABCD', 'ABCDE', 'XYZ']);

export function isSentinel(key: string): boolean {
  return SENTINELS.has(key);
}

export function friendlyName(key?: string | null): string {
  if (!key) return 'Unknown spot';
  if (SENTINELS.has(key)) return 'Hidden placeholder';
  const known = NAMES[key];
  if (known) return known.name;
  // auto-prettify: TOP_NEW_AD → "Top new banner"
  const words = key.toLowerCase().split('_').map((w) => (w === 'ad' || w === 'ads' ? 'banner' : w));
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function friendlyHint(key?: string | null): string | undefined {
  return key ? NAMES[key]?.hint : undefined;
}
