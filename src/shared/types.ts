import type {
  BrowsingIntentOutcome,
  DomainCategory,
  FrictionLevel,
  VisionSettings
} from "@/vision/types";

export type StartReason =
  "startup" | "tab-activated" | "navigation" | "window-focused" | "idle-resumed";

export type EndReason =
  | "tab-switched"
  | "navigation"
  | "window-blurred"
  | "idle"
  | "tab-closed"
  | "browser-recovery"
  | "tracking-disabled";

export interface UsageSession {
  id: string;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  startReason: StartReason;
  endReason: EndReason;
  dateKey: string;
  createdAt: number;
}

export interface DailyUsage {
  id: string;
  dateKey: string;
  domain: string;
  durationMs: number;
  sessionCount: number;
  lastUpdatedAt: number;
}

export interface BlockAttempt {
  id: string;
  domain: string;
  attemptedAt: number;
  dateKey: string;
  source: "navigation";
  count: number;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface AlwaysSchedule {
  mode: "always";
}

export interface CustomSchedule {
  mode: "custom";
  daysOfWeek: DayOfWeek[];
  startMinutes: number;
  endMinutes: number;
}

export type ScheduleConfig = AlwaysSchedule | CustomSchedule;

export interface BlockedDomain {
  id: string;
  domain: string;
  enabled: boolean;
  schedule: ScheduleConfig;
  createdAt: number;
}

export interface TimeLimitedDomain {
  id: string;
  domain: string;
  enabled: boolean;
  limitMinutes: number;
  schedule: ScheduleConfig;
  createdAt: number;
  bypassUntil: number | null;
}

export interface ExtensionSettings {
  schemaVersion: 1;
  trackingEnabled: boolean;
  idleThresholdSeconds: number;
  blockedDomains: BlockedDomain[];
  timeLimitedDomains: TimeLimitedDomain[];
  ignoredDomains: string[];
  showBlockedAttemptCount: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PersistedTrackingStatus =
  "tracking" | "inactive" | "idle" | "browser-unfocused" | "disabled";

export interface PersistedTrackingState {
  status: PersistedTrackingStatus;
  activeTabId: number | null;
  activeWindowId: number | null;
  domain: string | null;
  sessionStartedAt: number | null;
  lastTransitionAt: number;
  revision: number;
}

export interface RuntimeSessionMeta {
  startReason: StartReason | null;
}

export type ExtensionInstallReason = "install" | "update" | "browser_update" | "unknown";

export interface ExtensionLifecycleState {
  schemaVersion: 1;
  extensionId: string | null;
  installedVersion: string | null;
  previousVersion: string | null;
  lastInstallReason: ExtensionInstallReason | null;
  temporary: boolean | null;
  installedAt: number;
  updatedAt: number;
  lastMigrationAt: number | null;
  migrationRevision: number;
}

export type ReconcileReason =
  | "startup"
  | "installed"
  | "background-wakeup"
  | "tab-activated"
  | "navigation"
  | "window-focused"
  | "window-blurred"
  | "idle"
  | "idle-resumed"
  | "tab-closed"
  | "settings-changed"
  | "tracking-disabled"
  | "manual";

export interface ActiveBrowserContext {
  browserFocused: boolean;
  idleState: "active" | "idle" | "locked";
  activeTabId: number | null;
  activeWindowId: number | null;
  url: string | null;
  domain: string | null;
  trackable: boolean;
}

export interface UsageSummaryDomain {
  domain: string;
  durationMs: number;
  sessionCount: number;
}

export interface TodaySummary {
  dateKey: string;
  totalDurationMs: number;
  currentDomain: string | null;
  currentSessionElapsedMs: number;
  domains: UsageSummaryDomain[];
}

export type HistoryRange = "today" | "yesterday" | "last-7-days";

export interface HistorySessionView {
  id: string;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  dateKey: string;
}

export interface TimeLimitStatus {
  domain: string;
  limitMinutes: number;
  usedMs: number;
  remainingMs: number;
  exceeded: boolean;
  bypassUntil: number | null;
}

export type MessageRequest =
  | { type: "GET_TODAY_SUMMARY" }
  | { type: "GET_HISTORY"; range: HistoryRange }
  | { type: "GET_HISTORY_INTERVAL"; startedAt: number; endedAt: number }
  | { type: "GET_SETTINGS" }
  | {
      type: "UPDATE_SETTINGS";
      changes: Partial<
        Pick<
          ExtensionSettings,
          "trackingEnabled" | "idleThresholdSeconds" | "showBlockedAttemptCount"
        >
      >;
    }
  | { type: "ADD_BLOCKED_DOMAIN"; input: string; schedule?: ScheduleConfig }
  | { type: "REMOVE_BLOCKED_DOMAIN"; id: string }
  | { type: "SET_BLOCKED_DOMAIN_ENABLED"; id: string; enabled: boolean }
  | { type: "UPDATE_BLOCKED_DOMAIN"; id: string; input: string; schedule: ScheduleConfig }
  | { type: "UPDATE_BLOCKED_DOMAIN_SCHEDULE"; id: string; schedule: ScheduleConfig }
  | {
      type: "ADD_TIME_LIMITED_DOMAIN";
      input: string;
      limitMinutes: number;
      schedule?: ScheduleConfig;
    }
  | { type: "REMOVE_TIME_LIMITED_DOMAIN"; id: string }
  | { type: "SET_TIME_LIMITED_DOMAIN_ENABLED"; id: string; enabled: boolean }
  | {
      type: "UPDATE_TIME_LIMITED_DOMAIN";
      id: string;
      input?: string;
      limitMinutes: number;
      schedule?: ScheduleConfig;
    }
  | { type: "GET_TIME_LIMIT_STATUS"; domain: string }
  | { type: "BYPASS_TIME_LIMIT"; domain: string }
  | { type: "GET_VISION_REPORT" }
  | {
      type: "SET_DOMAIN_CLASSIFICATION";
      domain: string;
      primaryCategory: DomainCategory;
      secondaryCategories?: DomainCategory[];
    }
  | { type: "RESET_DOMAIN_CLASSIFICATION"; domain: string }
  | { type: "UPDATE_VISION_SETTINGS"; changes: Partial<VisionSettings> }
  | { type: "DISMISS_VISION_RECOMMENDATION"; id: string }
  | { type: "APPLY_VISION_RECOMMENDATION"; id: string }
  | {
      type: "UPSERT_FRICTION_RULE";
      domain: string;
      level: FrictionLevel;
      schedule?: ScheduleConfig;
      enabled?: boolean;
    }
  | { type: "REMOVE_FRICTION_RULE"; id: string }
  | {
      type: "RECORD_BROWSING_INTENT";
      domain: string;
      intent: string;
      outcome: BrowsingIntentOutcome;
    }
  | { type: "GET_RUNTIME_STATE" }
  | { type: "GET_BLOCKED_ATTEMPT_COUNT"; domain: string }
  | { type: "RECORD_BLOCK_ATTEMPT"; domain: string };

export type MessageResponse<T> = { ok: true; data: T } | { ok: false; error: string };
