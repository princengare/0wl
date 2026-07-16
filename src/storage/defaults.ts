import {
  DEFAULT_IDLE_THRESHOLD_SECONDS,
  RUNTIME_SESSION_META_STORAGE_KEY,
  RUNTIME_STATE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY
} from "@/shared/constants";
import type {
  ExtensionLifecycleState,
  ExtensionSettings,
  PersistedTrackingState,
  RuntimeSessionMeta
} from "@/shared/types";

export { LIFECYCLE_STORAGE_KEY } from "@/shared/constants";
export { RUNTIME_SESSION_META_STORAGE_KEY, RUNTIME_STATE_STORAGE_KEY, SETTINGS_STORAGE_KEY };

export function createDefaultSettings(now: number): ExtensionSettings {
  return {
    schemaVersion: 1,
    trackingEnabled: true,
    idleThresholdSeconds: DEFAULT_IDLE_THRESHOLD_SECONDS,
    blockedDomains: [],
    timeLimitedDomains: [],
    ignoredDomains: [],
    showBlockedAttemptCount: true,
    historyRetentionDays: null,
    createdAt: now,
    updatedAt: now
  };
}

export function createDefaultRuntimeState(now: number): PersistedTrackingState {
  return {
    status: "inactive",
    activeTabId: null,
    activeWindowId: null,
    domain: null,
    sessionStartedAt: null,
    lastTransitionAt: now,
    revision: 0
  };
}

export function createDefaultRuntimeSessionMeta(): RuntimeSessionMeta {
  return {
    startReason: null
  };
}

export function createDefaultLifecycleState(now: number): ExtensionLifecycleState {
  return {
    schemaVersion: 1,
    extensionId: null,
    installedVersion: null,
    previousVersion: null,
    lastInstallReason: null,
    temporary: null,
    installedAt: now,
    updatedAt: now,
    lastMigrationAt: null,
    migrationRevision: 0
  };
}
