// API model types. These mirror the backend Row POJOs as serialized by the @Primary (camelCase) ObjectMapper.
// NOTE the Lombok boolean quirk: `isActive`->`active`, `isVisible`->`visible`, `isEnabled`->`enabled`,
// `isMatch`->`match`; non-`is` boolean fields keep their name (`engineOn`).

export interface PredicateRule {
  id?: number;
  ruleKey: string;
  description?: string | null;
  expr: string; // raw JSON predicate-DSL
  active?: boolean;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface LayoutSlot {
  id?: number;
  module: string;
  location: string;
  slotOrder?: number | null;
  appVersionMin?: number | null;
  appVersionMax?: number | null;
  sentinel?: string | null;
  visibilityRuleId?: number | null;
  active?: boolean;
}

export interface AssetVariant {
  id?: number;
  variantKey: string;
  baseAdsId?: number | null;
  module?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  adType?: string | null;
  action?: string | null;
  url?: string | null;
  text?: string | null;
  adSize?: string | null;
  unitId?: string | null;
  padding?: number | null;
  refreshAd?: boolean | null;
  height?: number | null;
  dismissible?: boolean | null;
  customWidgetData?: string | null;
  lottieLoopCount?: number | null;
  lottieInLoop?: boolean | null;
  ruleId?: number | null;
  active?: boolean;
}

export interface AdRule {
  id?: number;
  module: string;
  location: string;
  adsId?: number | null;
  variantId?: number | null;
  ruleId?: number | null;
  priority?: number | null;
  active?: boolean;
  visible?: boolean;
}

export interface SuperMenuTile {
  id?: number;
  menuLocation: string;
  tileId: string;
  configModule?: string | null;
  colSpan?: number | null;
  rowSpan?: number | null;
  tileOrder?: number | null;
  ruleId?: number | null;
  active?: boolean;
  visible?: boolean;
}

export interface Experiment {
  id?: number;
  experimentKey: string;
  module?: string | null;
  location?: string | null;
  bucketFn?: string;
  bucketInput?: string;
  bucketCount?: number;
  enrollmentRuleId?: number | null;
  enabled?: boolean;
}

export interface ExperimentBucket {
  id?: number;
  experimentId?: number;
  bucketIndex?: number;
  variantId?: number | null;
  active?: boolean;
}

export interface EngineToggle {
  id?: number;
  adType: string;
  location: string;
  engineOn: boolean;
  shadowSamplePercent?: number | null;
  note?: string | null;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface ShadowDiff {
  id?: number;
  userId?: number | null;
  module?: string;
  location?: string | null;
  appVersion?: number | null;
  legacyOutput?: string | null;
  engineOutput?: string | null;
  match?: boolean;
  diffSummary?: string | null;
  createdAt?: string;
}

export interface AdsDTO {
  id: number;
  module?: string;
  imageURL?: string;
  adType?: string;
  url?: string;
  text?: string;
  action?: string;
  adSize?: string;
  unitId?: string;
  location?: string;
  padding?: number | null;
  refreshAd?: boolean | null;
  height?: number | null;
  dismissible?: boolean | null;
  customWidgetData?: string | null;
  lottieLoopCount?: number | null;
  lottieInLoop?: boolean | null;
}

export interface TraceDecision {
  location: string;
  served: 'LEGACY' | 'ADS' | 'VARIANT' | 'NOTHING';
  servedRuleId?: number | null;
  reason?: string;
  skipped: { ruleId?: number | null; reason: string }[];
}

export interface PreviewResult {
  userId: number;
  appVersion: number;
  isPaid: boolean;
  engineOn: boolean;
  served: AdsDTO[];       // what the app actually receives right now
  legacyList: AdsDTO[];   // what production logic computes
  engineList: AdsDTO[] | null; // what the engine computes
  trace: TraceDecision[];
  /** The app's VISUAL order — Flutter slots ads by location against this list (sentinels like ABCD/XYZ included). */
  widgetOrder?: string[];
}

/** explore_carousels_config row (for_api=true) — a config-driven widget the app gets via /resources/config/v5. */
export interface ConfigWidget {
  module: string;
  iconUrl?: string | null;
  showCarousel?: boolean;
  header?: string | null;
  subHeader?: string | null;
  backgroundColor?: string | null;
  param1?: string | null;
  param2?: string | null;
}

/** Cohort facts for a user, from GET /sample-user — same definitions the rule engine evaluates. */
export interface SampleUser {
  userId: number;
  contactNumber?: string | null; // masked
  subscriptionStatus?: string | null;
  paid?: boolean;
  guest?: boolean;
  kycCompleted?: boolean;
  os?: string | null;
  appVersion?: string | null;
  hasDevice?: boolean;
}

// ---- DSL schema catalog (from GET /schema) ----
export interface SchemaPath {
  path: string;
  label: string;
  type: 'boolean' | 'number' | 'string' | 'enum' | 'date';
  operators: string[];
  enum?: string[];
}
export interface SchemaFn {
  name: string;
  args: string[];
  returns: string;
}
export interface DslSchema {
  operators: string[];
  functions: SchemaFn[];
  paths: SchemaPath[];
}
