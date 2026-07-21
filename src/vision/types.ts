import type { ScheduleConfig } from "@/shared/types";

export type DomainCategory =
  | "focus"
  | "coding"
  | "school"
  | "research"
  | "communication"
  | "neutral"
  | "mixed"
  | "entertainment"
  | "social"
  | "distraction";

export type DomainClassificationSource = "seed" | "user";

export interface DomainClassification {
  domain: string;
  primaryCategory: DomainCategory;
  secondaryCategories: DomainCategory[];
  source: DomainClassificationSource;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface DomainTransition {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  fromDomain: string;
  toDomain: string;
  fromCategory: DomainCategory | null;
  toCategory: DomainCategory | null;
  transitionedAt: number;
  gapMs: number;
  previousSessionDurationMs: number;
  dateKey: string;
}

export type BehaviorEventType =
  | "distraction_path"
  | "focus_interruption"
  | "recovery"
  | "substitution"
  | "block_effectiveness"
  | "session_drift"
  | "attempt_chain"
  | "block_evasion";

export interface BehaviorEvent {
  id: string;
  type: BehaviorEventType;
  startedAt: number;
  endedAt: number | null;
  dateKey: string;
  domains: string[];
  categories: DomainCategory[];
  metadata: Record<string, unknown>;
}

export type BrowsingIntentOutcome = "active" | "confirmed" | "off_track" | "expired" | "skipped";

export interface BrowsingIntent {
  id: string;
  domain: string;
  intent: string;
  startedAt: number;
  expiresAt: number | null;
  completedAt: number | null;
  outcome: BrowsingIntentOutcome;
  dateKey: string;
}

export type FrictionLevel = 0 | 1 | 2 | 3 | 4;

export interface VisionFrictionRule {
  id: string;
  domain: string;
  enabled: boolean;
  level: FrictionLevel;
  schedule: ScheduleConfig;
  createdAt: number;
  updatedAt: number;
}

export interface VisionSettings {
  schemaVersion: 1;
  adaptiveRecommendationsEnabled: boolean;
  adaptiveEnforcementEnabled: boolean;
  maxAutomaticFrictionLevel: FrictionLevel;
  excludedAdaptiveDomains: string[];
  dismissedRecommendationIds: string[];
  frictionRules: VisionFrictionRule[];
  createdAt: number;
  updatedAt: number;
}

export interface TransitionSummary {
  id: string;
  fromDomain: string;
  toDomain: string;
  fromCategory: DomainCategory | null;
  toCategory: DomainCategory | null;
  count: number;
  averageGapMs: number;
  averagePreviousSessionDurationMs: number;
}

export interface PathwaySummary {
  id: string;
  domains: string[];
  categories: DomainCategory[];
  count: number;
  averageDiversionMs: number;
  commonEntry: string | null;
  displayLabel?: string;
  displaySegments?: string[];
  rawDomains?: string[];
  includedFocusDomains?: string[];
  lastFocusDomain?: string | null;
  firstDistractionDomain?: string | null;
  averageTimeBeforeDistractionMs?: number;
  totalDurationMs?: number;
  confidence?: "low" | "medium" | "high";
  details?: Array<{
    label: string;
    value: string;
  }>;
}

export interface ContextSummary {
  domain: string;
  previousCategories: Array<{ category: DomainCategory | "other"; count: number; percent: number }>;
  previousDomains: Array<{ domain: string; count: number }>;
  commonHours: Array<{ hour: number; count: number }>;
  averagePreviousSessionDurationMs: number;
}

export interface RecoverySummary {
  averageRecoveryMs: number;
  weeklyRecoveryMs: number;
  worstDomains: Array<{
    domain: string;
    count: number;
    totalRecoveryMs: number;
    averageRecoveryMs: number;
  }>;
}

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  count: number;
  domains: Array<{ domain: string; count: number }>;
}

export interface BlockOutcomeSummary {
  domain: string;
  attempts: number;
  returnedToFocusPercent: number;
  substituteDistractionPercent: number;
  inactivePercent: number;
}

export interface SubstitutionSummary {
  blockedDomain: string;
  decreasedMsPerDay: number;
  substitutes: Array<{ domain: string; increasedMsPerDay: number }>;
  netReclaimedMsPerDay: number;
}

export interface VisionRecommendation {
  id: string;
  title: string;
  reason: string;
  supportingMetric: string;
  proposedAction: string;
  strength: "low" | "medium" | "high";
  domains: string[];
  action:
    | { type: "none" }
    | { type: "add_block"; domain: string; schedule: ScheduleConfig }
    | { type: "add_friction"; domain: string; level: FrictionLevel; schedule: ScheduleConfig };
}

export interface PersonalizedInsight {
  id: string;
  text: string;
  supportingMetric: string;
  period: string;
  domains: string[];
  suggestedAction: string | null;
}

export interface TrendSummary {
  dailyDistractionMs: number;
  weeklyDistractionMs: number;
  monthlyDistractionMs: number;
  blockedAttemptCount: number;
  focusInterruptionCount: number;
}

export interface VisionReport {
  generatedAt: number;
  seedClassificationCount: number;
  classifiedDomains: DomainClassification[];
  unclassifiedDomains: string[];
  transitions: TransitionSummary[];
  distractionTransitions: TransitionSummary[];
  focusInterruptions: TransitionSummary[];
  pathways: PathwaySummary[];
  sessionDrifts: PathwaySummary[];
  attemptChains: PathwaySummary[];
  blockEvasions: PathwaySummary[];
  contexts: ContextSummary[];
  recovery: RecoverySummary;
  heatmap: HeatmapCell[];
  blockOutcomes: BlockOutcomeSummary[];
  bounceBackRate: number;
  substitutions: SubstitutionSummary[];
  netTimeReclaimedMsPerDay: number;
  recommendations: VisionRecommendation[];
  insights: PersonalizedInsight[];
  trends: TrendSummary;
  settings: VisionSettings;
}
