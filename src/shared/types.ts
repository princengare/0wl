import type {
  BrowsingIntentOutcome,
  DomainCategory,
  FrictionLevel,
  VisionSettings
} from "@/vision/types";

export type StartReason =
  | "startup"
  | "tab-activated"
  | "navigation"
  | "window-focused"
  | "idle-resumed"
  | "media-started"
  | "media-resumed";

export type EndReason =
  | "tab-switched"
  | "navigation"
  | "window-blurred"
  | "idle"
  | "tab-closed"
  | "browser-recovery"
  | "tracking-disabled"
  | "media-stopped"
  | "media-mode-changed"
  | "media-stale";

export interface UsageSession {
  id: string;
  domain: string;
  windowScope?: WindowScope;
  usageMode?: UsageMode;
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
  windowScope?: WindowScope;
  durationMs: number;
  sessionCount: number;
  lastUpdatedAt: number;
}

export interface BlockAttempt {
  id: string;
  domain: string;
  windowScope?: WindowScope;
  attemptedAt: number;
  dateKey: string;
  source: "navigation";
  count: number;
}

export type WindowScope = "regular" | "private";
export type UsageMode = "active" | "pip" | "background";

export interface HistoryModeSelection {
  private: boolean;
  mediaMode: UsageMode;
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
  windowScope?: WindowScope;
  enabled: boolean;
  schedule: ScheduleConfig;
  createdAt: number;
}

export type TimeLimitTargetType = "domain" | "global";

export interface TimeLimitedDomain {
  id: string;
  domain: string | null;
  targetType: TimeLimitTargetType;
  windowScope: WindowScope;
  enabled: boolean;
  limitMinutes: number;
  schedule: ScheduleConfig;
  createdAt: number;
  bypassUntil: number | null;
}

export interface ScheduledBreakRule {
  id: string;
  enabled: boolean;
  windowScope: WindowScope;
  breakAfterMinutes: number;
  breakDurationMinutes: number;
  schedule: ScheduleConfig;
  createdAt: number;
  updatedAt: number;
}

export type HistoryRetentionDays = 30 | 90 | 180 | 365 | null;

export interface ExtensionSettings {
  schemaVersion: 1;
  trackingEnabled: boolean;
  privateBrowserTrackingEnabled: boolean;
  idleThresholdSeconds: number;
  blockedDomains: BlockedDomain[];
  timeLimitedDomains: TimeLimitedDomain[];
  scheduledBreakRules: ScheduledBreakRule[];
  ignoredDomains: string[];
  showBlockedAttemptCount: boolean;
  historyRetentionDays: HistoryRetentionDays;
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
  windowScope?: WindowScope | null;
  sessionStartedAt: number | null;
  lastTransitionAt: number;
  revision: number;
}

export type MediaUsageMode = Exclude<UsageMode, "active">;

export interface PersistedMediaTabReport {
  tabId: number;
  windowId: number | null;
  url: string;
  domain: string;
  windowScope: WindowScope;
  playing: boolean;
  playingAudio: boolean;
  playingVideo: boolean;
  pictureInPicture: boolean;
  pictureInPictureSupported: boolean;
  reportedAt: number;
}

export interface PersistedMediaSessionState {
  key: string;
  tabId: number;
  windowId: number | null;
  domain: string;
  windowScope: WindowScope;
  usageMode: MediaUsageMode;
  startedAt: number;
  lastObservedAt: number;
}

export interface PersistedMediaTrackingState {
  schemaVersion: 1;
  reports: PersistedMediaTabReport[];
  sessions: PersistedMediaSessionState[];
  updatedAt: number;
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
  windowScope?: WindowScope;
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
  windowScope: WindowScope;
  usageMode?: UsageMode;
  aggregateOnly?: boolean;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  dateKey: string;
}

export interface TimeLimitStatus {
  domain: string | null;
  targetType: TimeLimitTargetType;
  windowScope: WindowScope;
  label: string;
  limitMinutes: number;
  usedMs: number;
  remainingMs: number;
  exceeded: boolean;
  bypassUntil: number | null;
}

export interface DataControlStatus {
  sessions: number;
  dailyUsageRecords: number;
  blockedAttempts: number;
  visionEvents: number;
  seedSiteCategories: number;
  customSiteCategories: number;
  oldestRecordAt: number | null;
  storageUsedBytes: number;
  historyRetentionDays: HistoryRetentionDays;
}

export interface UsageDataRepairResult {
  removedSessions: number;
  rebuiltDailyUsageRecords: number;
  resetStaleRuntimeState: boolean;
}

export type ScheduledBreakStatusValue = "inactive" | "counting" | "break-active" | "dnd";

export interface ScheduledBreakRuntimeEntry {
  ruleId: string;
  windowScope: WindowScope;
  status: ScheduledBreakStatusValue;
  cycleStartedAt: number;
  carriedMs: number;
  breakStartedAt: number | null;
  breakActiveUntil: number | null;
  dndEnabled: boolean;
  dndStartedAt: number | null;
  updatedAt: number;
}

export interface ScheduledBreakRuntimeState {
  schemaVersion: 1;
  rules: ScheduledBreakRuntimeEntry[];
  updatedAt: number;
  revision: number;
}

export interface ScheduledBreakStatus {
  visible: boolean;
  dndEnabled: boolean;
  breakActive: boolean;
  breakActiveUntil: number | null;
  ruleCount: number;
  activeRuleLabel: string | null;
  remainingBreakMs: number;
  nextBreakAfterMs: number | null;
  breakStartedAt: number | null;
  canEndBreak: boolean;
  canEndBreakAt: number | null;
}

export type DataImportMode = "merge" | "replace";

export type DataDeleteTarget =
  | "browsing-history"
  | "blocked-attempts"
  | "vision-analytics"
  | "custom-site-categories"
  | "settings";

export interface DataBackup {
  app: "0wl";
  schemaVersion: 1;
  exportedAt: number;
  version: string;
  database: {
    sessions: UsageSession[];
    dailyUsage: DailyUsage[];
    blockAttempts: BlockAttempt[];
    domainTransitions: unknown[];
    browsingIntents: unknown[];
  };
  storage: {
    settings: ExtensionSettings | null;
    visionSettings: VisionSettings | null;
    visionDomainClassifications: unknown[];
  };
}

export interface DataExportResult {
  fileName: string;
  backup: DataBackup;
}

export type SyncBrowserTarget = "firefox" | "chrome" | "edge" | "opera" | "safari" | "unknown";

export interface SyncBundle {
  app: "0wl";
  schemaVersion: 1;
  exportedAt: number;
  version: string;
  sourceBrowser: SyncBrowserTarget;
  sourceExtensionId?: string;
  sourceDeviceId?: string;
  includesPrivateData: boolean;
  data: {
    sessions: UsageSession[];
    dailyUsage: DailyUsage[];
    blockAttempts: BlockAttempt[];
    blockedSites: BlockedDomain[];
    timeLimits: TimeLimitedDomain[];
    scheduledBreakRules: ScheduledBreakRule[];
    frictionRules: VisionSettings["frictionRules"];
    visionSettings: VisionSettings | null;
    siteCategories: unknown[];
    settingsSubset?: Partial<ExtensionSettings>;
  };
  checksum?: string;
}

export interface SyncConflict {
  id: string;
  type:
    | "blocked-site"
    | "time-limit"
    | "scheduled-break"
    | "friction-rule"
    | "site-category"
    | "vision-settings";
  label: string;
  currentSummary: string;
  importedSummary: string;
}

export interface SyncImportPreview {
  valid: boolean;
  sourceBrowser: SyncBrowserTarget;
  sourceExtensionId?: string;
  exportedAt: number;
  includesPrivateData: boolean;
  sessionsToAdd: number;
  duplicateSessionsSkipped: number;
  blockAttemptsToAdd: number;
  blockedSitesToAdd: number;
  blockedSitesToUpdate: number;
  timeLimitsToAdd: number;
  timeLimitsToUpdate: number;
  scheduledBreaksToAdd: number;
  scheduledBreaksToUpdate: number;
  frictionRulesToAdd: number;
  frictionRulesToUpdate: number;
  siteCategoriesToAdd: number;
  siteCategoriesToUpdate: number;
  visionSettingsToMerge: boolean;
  conflicts: SyncConflict[];
}

export interface SyncExportResult {
  fileName: string;
  bundle: SyncBundle;
}

export type SyncConflictResolution = "keep-current" | "use-imported" | "skip";

export interface SyncImportResult extends SyncImportPreview {
  applied: boolean;
  rebuiltDailyUsageRecords: number;
}

export interface SyncDiagnostics {
  currentBrowser: SyncBrowserTarget;
  extensionId: string | null;
  syncMethod: "export-import";
  sourceBrowserRecorded: boolean;
  sourceExtensionIdRecorded: boolean;
  exportAvailable: boolean;
  importPreviewAvailable: boolean;
  duplicatePrevention: "enabled";
  conflictReview: "enabled";
  privateDataDefaultExcluded: boolean;
  lastExportAt: number | null;
  lastImportAt: number | null;
  lastImportSourceBrowser: SyncBrowserTarget | null;
  lastImportSourceExtensionId: string | null;
  limitations: string[];
}

export type MessageRequest =
  | { type: "GET_TODAY_SUMMARY" }
  | { type: "GET_HISTORY"; range: HistoryRange; windowScope?: WindowScope; usageMode?: UsageMode }
  | {
      type: "GET_HISTORY_INTERVAL";
      startedAt: number;
      endedAt: number;
      windowScope?: WindowScope;
      usageMode?: UsageMode;
    }
  | { type: "GET_SETTINGS" }
  | {
      type: "UPDATE_SETTINGS";
      changes: Partial<
        Pick<
          ExtensionSettings,
          | "trackingEnabled"
          | "privateBrowserTrackingEnabled"
          | "idleThresholdSeconds"
          | "showBlockedAttemptCount"
          | "historyRetentionDays"
        >
      >;
    }
  | {
      type: "ADD_BLOCKED_DOMAIN";
      input: string;
      schedule?: ScheduleConfig;
      windowScope?: WindowScope;
    }
  | { type: "REMOVE_BLOCKED_DOMAIN"; id: string }
  | { type: "SET_BLOCKED_DOMAIN_ENABLED"; id: string; enabled: boolean }
  | {
      type: "UPDATE_BLOCKED_DOMAIN";
      id: string;
      input: string;
      schedule: ScheduleConfig;
      windowScope?: WindowScope;
    }
  | { type: "UPDATE_BLOCKED_DOMAIN_SCHEDULE"; id: string; schedule: ScheduleConfig }
  | {
      type: "ADD_TIME_LIMITED_DOMAIN";
      input: string;
      limitMinutes: number;
      schedule?: ScheduleConfig;
      windowScope?: WindowScope;
    }
  | {
      type: "ADD_SCHEDULED_BREAK_RULE";
      breakAfterMinutes: number;
      breakDurationMinutes?: number;
      schedule?: ScheduleConfig;
      windowScope?: WindowScope;
    }
  | { type: "REMOVE_SCHEDULED_BREAK_RULE"; id: string }
  | { type: "SET_SCHEDULED_BREAK_RULE_ENABLED"; id: string; enabled: boolean }
  | {
      type: "UPDATE_SCHEDULED_BREAK_RULE";
      id: string;
      breakAfterMinutes: number;
      breakDurationMinutes: number;
      schedule?: ScheduleConfig;
      windowScope?: WindowScope;
    }
  | { type: "GET_SCHEDULED_BREAK_STATUS"; windowScope?: WindowScope }
  | { type: "SET_SCHEDULED_BREAK_DND"; enabled: boolean; windowScope?: WindowScope }
  | { type: "END_SCHEDULED_BREAK"; windowScope?: WindowScope }
  | { type: "REMOVE_TIME_LIMITED_DOMAIN"; id: string }
  | { type: "SET_TIME_LIMITED_DOMAIN_ENABLED"; id: string; enabled: boolean }
  | {
      type: "UPDATE_TIME_LIMITED_DOMAIN";
      id: string;
      input?: string;
      limitMinutes: number;
      schedule?: ScheduleConfig;
      windowScope?: WindowScope;
    }
  | {
      type: "GET_TIME_LIMIT_STATUS";
      domain?: string;
      targetType?: TimeLimitTargetType;
      windowScope?: WindowScope;
    }
  | {
      type: "BYPASS_TIME_LIMIT";
      domain?: string;
      targetType?: TimeLimitTargetType;
      windowScope?: WindowScope;
    }
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
  | { type: "GET_DATA_CONTROL_STATUS" }
  | { type: "EXPORT_ALL_DATA" }
  | { type: "IMPORT_DATA_BACKUP"; backup: DataBackup; mode: DataImportMode }
  | { type: "EXPORT_LOCAL_SYNC_BUNDLE"; includePrivateData?: boolean }
  | { type: "PREVIEW_LOCAL_SYNC_IMPORT"; bundle: SyncBundle }
  | { type: "GET_LOCAL_SYNC_DIAGNOSTICS" }
  | {
      type: "APPLY_LOCAL_SYNC_IMPORT";
      bundle: SyncBundle;
      conflictResolution: SyncConflictResolution;
    }
  | { type: "SET_HISTORY_RETENTION"; historyRetentionDays: HistoryRetentionDays }
  | { type: "DELETE_LOCAL_DATA"; target: DataDeleteTarget }
  | { type: "CLEAR_PRIVATE_BROWSING_DATA" }
  | { type: "RESET_ALL_LOCAL_DATA"; confirmation: string }
  | { type: "GET_BLOCKED_ATTEMPT_COUNT"; domain: string; windowScope?: WindowScope }
  | { type: "RECORD_BLOCK_ATTEMPT"; domain: string; windowScope?: WindowScope }
  | {
      type: "REPORT_MEDIA_STATE";
      url: string;
      playing: boolean;
      playingAudio?: boolean;
      playingVideo?: boolean;
      pictureInPicture: boolean;
      pictureInPictureSupported?: boolean;
      reportedAt?: number;
    };

export type MessageResponse<T> = { ok: true; data: T } | { ok: false; error: string };
