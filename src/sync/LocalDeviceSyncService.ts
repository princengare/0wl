import { STORE_BLOCK_ATTEMPTS, STORE_DAILY_USAGE, STORE_SESSIONS } from "@/db/schema";
import { openDatabase, requestToPromise, transactionDone } from "@/db/database";
import type { BlockRuleManager } from "@/background/blocking/BlockRuleManager";
import type { ScheduledBreakManager } from "@/background/breaks/ScheduledBreakManager";
import type { TimeLimitManager } from "@/background/timeLimits/TimeLimitManager";
import type { FrictionRuleManager } from "@/vision/friction/FrictionRuleManager";
import type { SettingsStore } from "@/storage/SettingsStore";
import type { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import { browser } from "@/shared/browser";
import {
  LOCAL_SYNC_DIAGNOSTICS_STORAGE_KEY,
  LOCAL_SYNC_DEVICE_ID_STORAGE_KEY,
  VISION_SETTINGS_STORAGE_KEY,
  VISION_CLASSIFICATIONS_STORAGE_KEY
} from "@/shared/constants";
import { getBrowserTarget } from "@/platform/browserTarget";
import { normalizeWindowScope } from "@/platform/windowScope";
import { splitDurationByLocalDate } from "@/shared/time";
import { isPlainObject } from "@/shared/validation";
import type {
  BlockAttempt,
  BlockedDomain,
  DailyUsage,
  ExtensionSettings,
  ScheduledBreakRule,
  SyncBundle,
  SyncConflict,
  SyncConflictResolution,
  SyncDiagnostics,
  SyncExportResult,
  SyncImportPreview,
  SyncImportResult,
  TimeLimitedDomain,
  UsageSession,
  WindowScope
} from "@/shared/types";
import type { VisionFrictionRule, VisionSettings } from "@/vision/types";

type StorageArea = browser.storage.StorageArea;

interface LocalDeviceSyncDependencies {
  settingsStore: SettingsStore;
  visionSettingsStore: VisionSettingsStore;
  blockRuleManager: BlockRuleManager;
  timeLimitManager: TimeLimitManager;
  scheduledBreakManager: ScheduledBreakManager;
  frictionRuleManager: FrictionRuleManager;
  storageArea?: StorageArea;
  now?: () => number;
}

type SyncStoreName = typeof STORE_SESSIONS | typeof STORE_DAILY_USAGE | typeof STORE_BLOCK_ATTEMPTS;

interface MergePlan {
  preview: SyncImportPreview;
  sessionsToAdd: UsageSession[];
  blockAttemptsToAdd: BlockAttempt[];
  settings: ExtensionSettings;
  visionSettings: VisionSettings;
  siteCategories: unknown[];
}

interface SyncDiagnosticsMetadata {
  lastExportAt?: number;
  lastImportAt?: number;
  lastImportSourceBrowser?: SyncDiagnostics["lastImportSourceBrowser"];
  lastImportSourceExtensionId?: string | null;
}

function isSyncBundle(value: unknown): value is SyncBundle {
  return (
    isPlainObject(value) &&
    value.app === "0wl" &&
    value.schemaVersion === 1 &&
    isPlainObject(value.data) &&
    Array.isArray(value.data.sessions) &&
    Array.isArray(value.data.dailyUsage) &&
    Array.isArray(value.data.blockAttempts) &&
    Array.isArray(value.data.blockedSites) &&
    Array.isArray(value.data.timeLimits) &&
    Array.isArray(value.data.scheduledBreakRules) &&
    Array.isArray(value.data.frictionRules) &&
    Array.isArray(value.data.siteCategories)
  );
}

async function listStore<T>(storeName: SyncStoreName): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const rows = await requestToPromise(transaction.objectStore(storeName).getAll());
  await transactionDone(transaction);
  return rows as T[];
}

async function putRows<T>(storeName: SyncStoreName, rows: T[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);

  for (const row of rows) {
    store.put(row);
  }

  await transactionDone(transaction);
}

async function replaceDailyUsage(rows: DailyUsage[]): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_DAILY_USAGE, "readwrite");
  const store = transaction.objectStore(STORE_DAILY_USAGE);
  store.clear();

  for (const row of rows) {
    store.put(row);
  }

  await transactionDone(transaction);
}

function normalizeUsageMode(value: unknown): UsageSession["usageMode"] {
  return value === "pip" || value === "background" ? value : "active";
}

function normalizeSession(session: UsageSession): UsageSession {
  return {
    ...session,
    windowScope: normalizeWindowScope(session.windowScope),
    usageMode: normalizeUsageMode(session.usageMode)
  };
}

function sessionFingerprint(session: UsageSession): string {
  const normalized = normalizeSession(session);
  return [
    normalized.domain,
    normalized.startedAt,
    normalized.endedAt,
    normalized.durationMs,
    normalized.windowScope,
    normalized.usageMode
  ].join("::");
}

function scheduleKey(value: unknown): string {
  return JSON.stringify(value ?? { mode: "always" });
}

function blockedKey(rule: Pick<BlockedDomain, "domain" | "windowScope">): string {
  return `${normalizeWindowScope(rule.windowScope)}::${rule.domain}`;
}

function timeLimitKey(
  rule: Pick<TimeLimitedDomain, "targetType" | "domain" | "windowScope">
): string {
  return `${normalizeWindowScope(rule.windowScope)}::${rule.targetType}::${
    rule.domain ?? "all-browsing"
  }`;
}

function breakKey(rule: Pick<ScheduledBreakRule, "windowScope">): string {
  return normalizeWindowScope(rule.windowScope);
}

function frictionKey(rule: Pick<VisionFrictionRule, "domain">): string {
  return rule.domain;
}

function categoryKey(value: unknown): string | null {
  return isPlainObject(value) && typeof value.domain === "string" ? value.domain : null;
}

function summarizeBlocked(rule: BlockedDomain): string {
  return `${rule.enabled ? "active" : "paused"} ${scheduleKey(rule.schedule)}`;
}

function summarizeTimeLimit(rule: TimeLimitedDomain): string {
  return `${rule.enabled ? "active" : "paused"} ${rule.limitMinutes}m ${scheduleKey(rule.schedule)}`;
}

function summarizeBreak(rule: ScheduledBreakRule): string {
  return `${rule.enabled ? "active" : "paused"} after ${rule.breakAfterMinutes}m ${scheduleKey(
    rule.schedule
  )}`;
}

function summarizeFriction(rule: VisionFrictionRule): string {
  return `${rule.enabled ? "active" : "paused"} level ${rule.level} ${scheduleKey(rule.schedule)}`;
}

function settingsSubset(settings: ExtensionSettings): Partial<ExtensionSettings> {
  return {
    trackingEnabled: settings.trackingEnabled,
    idleThresholdSeconds: settings.idleThresholdSeconds,
    ignoredDomains: settings.ignoredDomains,
    showBlockedAttemptCount: settings.showBlockedAttemptCount,
    historyRetentionDays: settings.historyRetentionDays
  };
}

function dailyUsageId(dateKey: string, domain: string, windowScope: WindowScope): string {
  return windowScope === "regular"
    ? `${dateKey}::${domain}`
    : `${dateKey}::${windowScope}::${domain}`;
}

function buildDailyUsageRowsFromSessions(sessions: UsageSession[], now: number): DailyUsage[] {
  const rowsById = new Map<string, DailyUsage>();

  for (const session of sessions.map(normalizeSession)) {
    if (session.usageMode !== "active") {
      continue;
    }

    for (const slice of splitDurationByLocalDate(session.startedAt, session.endedAt)) {
      const windowScope = normalizeWindowScope(session.windowScope);
      const id = dailyUsageId(slice.dateKey, session.domain, windowScope);
      const existing = rowsById.get(id);
      rowsById.set(id, {
        id,
        dateKey: slice.dateKey,
        domain: session.domain,
        windowScope,
        durationMs: (existing?.durationMs ?? 0) + slice.durationMs,
        sessionCount: (existing?.sessionCount ?? 0) + 1,
        lastUpdatedAt: Math.max(existing?.lastUpdatedAt ?? 0, session.createdAt || now)
      });
    }
  }

  return [...rowsById.values()];
}

function addConflict(
  conflicts: SyncConflict[],
  type: SyncConflict["type"],
  label: string,
  currentSummary: string,
  importedSummary: string
): void {
  conflicts.push({
    id: `${type}:${label}`,
    type,
    label,
    currentSummary,
    importedSummary
  });
}

function mergeKeyed<T>(
  current: T[],
  incoming: T[],
  keyFor: (item: T) => string,
  summaryFor: (item: T) => string,
  conflictType: SyncConflict["type"],
  resolution: SyncConflictResolution,
  conflicts: SyncConflict[]
): { merged: T[]; added: number; updated: number } {
  const byKey = new Map(current.map((item) => [keyFor(item), item]));
  let added = 0;
  let updated = 0;

  for (const item of incoming) {
    const key = keyFor(item);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, item);
      added += 1;
      continue;
    }

    if (summaryFor(existing) === summaryFor(item)) {
      continue;
    }

    addConflict(conflicts, conflictType, key, summaryFor(existing), summaryFor(item));
    updated += 1;

    if (resolution === "use-imported") {
      byKey.set(key, item);
    }
  }

  return { merged: [...byKey.values()], added, updated };
}

function mergeSiteCategories(
  current: unknown[],
  incoming: unknown[],
  resolution: SyncConflictResolution,
  conflicts: SyncConflict[]
): { merged: unknown[]; added: number; updated: number } {
  const byDomain = new Map<string, unknown>();
  let added = 0;
  let updated = 0;

  for (const item of current) {
    const key = categoryKey(item);

    if (key) {
      byDomain.set(key, item);
    }
  }

  for (const item of incoming) {
    const key = categoryKey(item);

    if (!key) {
      continue;
    }

    const existing = byDomain.get(key);

    if (!existing) {
      byDomain.set(key, item);
      added += 1;
      continue;
    }

    if (JSON.stringify(existing) === JSON.stringify(item)) {
      continue;
    }

    addConflict(conflicts, "site-category", key, JSON.stringify(existing), JSON.stringify(item));
    updated += 1;

    if (resolution === "use-imported") {
      byDomain.set(key, item);
    }
  }

  return { merged: [...byDomain.values()], added, updated };
}

export class LocalDeviceSyncService {
  private readonly storageArea: StorageArea;
  private readonly now: () => number;

  constructor(private readonly dependencies: LocalDeviceSyncDependencies) {
    this.storageArea = dependencies.storageArea ?? browser.storage.local;
    this.now = dependencies.now ?? Date.now;
  }

  async exportBundle(includePrivateData = false): Promise<SyncExportResult> {
    const now = this.now();
    const sourceDeviceId = await this.getOrCreateDeviceId();
    const settings = await this.dependencies.settingsStore.get(now);
    const visionSettings = await this.dependencies.visionSettingsStore.get(now);
    const siteCategories = await this.readSiteCategories();
    const sessions = (await listStore<UsageSession>(STORE_SESSIONS))
      .map(normalizeSession)
      .filter((session) => session.windowScope === "regular");
    const dailyUsage = (await listStore<DailyUsage>(STORE_DAILY_USAGE)).filter(
      (row) => includePrivateData || normalizeWindowScope(row.windowScope) === "regular"
    );
    const blockAttempts = (await listStore<BlockAttempt>(STORE_BLOCK_ATTEMPTS)).filter(
      (attempt) => normalizeWindowScope(attempt.windowScope) === "regular"
    );
    const blockedSites = settings.blockedDomains.filter(
      (rule) => includePrivateData || normalizeWindowScope(rule.windowScope) === "regular"
    );
    const timeLimits = settings.timeLimitedDomains.filter(
      (rule) => includePrivateData || normalizeWindowScope(rule.windowScope) === "regular"
    );
    const scheduledBreakRules = settings.scheduledBreakRules.filter(
      (rule) => includePrivateData || normalizeWindowScope(rule.windowScope) === "regular"
    );

    const bundle: SyncBundle = {
      app: "0wl",
      schemaVersion: 1,
      exportedAt: now,
      version: browser.runtime.getManifest().version,
      sourceBrowser: getBrowserTarget(),
      sourceExtensionId: browser.runtime.id,
      sourceDeviceId,
      includesPrivateData: includePrivateData,
      data: {
        sessions,
        dailyUsage,
        blockAttempts,
        blockedSites,
        timeLimits,
        scheduledBreakRules,
        frictionRules: visionSettings.frictionRules,
        visionSettings,
        siteCategories,
        settingsSubset: settingsSubset(settings)
      }
    };
    bundle.checksum = await this.checksum(bundle);
    await this.updateDiagnosticsMetadata({
      lastExportAt: now
    });

    return {
      fileName: `0wl-sync-${bundle.sourceBrowser}-${new Date(now).toISOString().slice(0, 10)}.json`,
      bundle
    };
  }

  async previewImport(candidate: unknown): Promise<SyncImportPreview> {
    return (await this.createMergePlan(candidate, "keep-current")).preview;
  }

  async applyImport(
    candidate: unknown,
    conflictResolution: SyncConflictResolution
  ): Promise<SyncImportResult> {
    const now = this.now();
    const plan = await this.createMergePlan(candidate, conflictResolution);
    const currentDailyUsage = await listStore<DailyUsage>(STORE_DAILY_USAGE);

    await putRows(STORE_SESSIONS, plan.sessionsToAdd);
    await putRows(STORE_BLOCK_ATTEMPTS, plan.blockAttemptsToAdd);

    const allSessions = await listStore<UsageSession>(STORE_SESSIONS);
    const rebuiltDailyUsage = buildDailyUsageRowsFromSessions(allSessions, now);
    const dailyUsageById = new Map(rebuiltDailyUsage.map((row) => [row.id, row]));

    const importedDailyUsage =
      isSyncBundle(candidate) && candidate.includesPrivateData ? candidate.data.dailyUsage : [];

    for (const row of [...currentDailyUsage, ...importedDailyUsage]) {
      if (normalizeWindowScope(row.windowScope) !== "private") {
        continue;
      }

      const normalized = { ...row, windowScope: "private" as WindowScope };

      if (!dailyUsageById.has(normalized.id)) {
        dailyUsageById.set(normalized.id, normalized);
      }
    }

    const nextDailyUsage = [...dailyUsageById.values()];
    await replaceDailyUsage(nextDailyUsage);

    await this.dependencies.settingsStore.save(plan.settings);
    await this.dependencies.settingsStore.migrateStoredSettings(now);
    await this.storageArea.set({
      [VISION_CLASSIFICATIONS_STORAGE_KEY]: plan.siteCategories
    });
    await this.storageArea.set({
      // Keep Vision settings as one settings object because its store owns validation.
      [VISION_SETTINGS_STORAGE_KEY]: plan.visionSettings
    });

    const nextSettings = await this.dependencies.settingsStore.get(now);
    const nextVisionSettings = await this.dependencies.visionSettingsStore.get(now);
    await this.dependencies.blockRuleManager.refreshDynamicRules(
      nextSettings.blockedDomains,
      now,
      nextSettings.privateBrowserTrackingEnabled
    );
    await this.dependencies.timeLimitManager.refresh();
    await this.dependencies.scheduledBreakManager.refresh();
    await this.dependencies.frictionRuleManager.refreshDynamicRules(
      nextVisionSettings.frictionRules
    );
    await this.updateDiagnosticsMetadata({
      lastImportAt: now,
      lastImportSourceBrowser: plan.preview.sourceBrowser,
      lastImportSourceExtensionId: plan.preview.sourceExtensionId ?? null
    });

    return {
      ...plan.preview,
      applied: true,
      rebuiltDailyUsageRecords: nextDailyUsage.length
    };
  }

  async getDiagnostics(): Promise<SyncDiagnostics> {
    const metadata = await this.readDiagnosticsMetadata();

    return {
      currentBrowser: getBrowserTarget(),
      extensionId: browser.runtime.id ?? null,
      syncMethod: "export-import",
      sourceBrowserRecorded: true,
      sourceExtensionIdRecorded: true,
      exportAvailable: true,
      importPreviewAvailable: true,
      duplicatePrevention: "enabled",
      conflictReview: "enabled",
      privateDataDefaultExcluded: true,
      lastExportAt: metadata.lastExportAt ?? null,
      lastImportAt: metadata.lastImportAt ?? null,
      lastImportSourceBrowser: metadata.lastImportSourceBrowser ?? null,
      lastImportSourceExtensionId: metadata.lastImportSourceExtensionId ?? null,
      limitations: [
        "Browser extension storage is sandboxed per browser.",
        "v0.1.9 sync uses local export/import bundles.",
        "Automatic same-device sync would require a local Native Messaging companion."
      ]
    };
  }

  private async createMergePlan(
    candidate: unknown,
    resolution: SyncConflictResolution
  ): Promise<MergePlan> {
    if (!isSyncBundle(candidate)) {
      throw new Error("Choose a valid 0wl sync bundle.");
    }

    if (resolution !== "keep-current" && resolution !== "use-imported" && resolution !== "skip") {
      throw new Error("Choose a valid sync conflict option.");
    }

    const now = this.now();
    const currentSettings = await this.dependencies.settingsStore.get(now);
    const currentVisionSettings = await this.dependencies.visionSettingsStore.get(now);
    const currentCategories = await this.readSiteCategories();
    const currentSessions = (await listStore<UsageSession>(STORE_SESSIONS)).map(normalizeSession);
    const currentAttempts = await listStore<BlockAttempt>(STORE_BLOCK_ATTEMPTS);
    const includePrivateData = candidate.includesPrivateData === true;
    const incomingBlockedSites = candidate.data.blockedSites.filter(
      (rule) => includePrivateData || normalizeWindowScope(rule.windowScope) === "regular"
    );
    const incomingTimeLimits = candidate.data.timeLimits.filter(
      (rule) => includePrivateData || normalizeWindowScope(rule.windowScope) === "regular"
    );
    const incomingBreakRules = candidate.data.scheduledBreakRules.filter(
      (rule) => includePrivateData || normalizeWindowScope(rule.windowScope) === "regular"
    );
    const currentSessionKeys = new Set([
      ...currentSessions.map((session) => session.id),
      ...currentSessions.map((session) => sessionFingerprint(session))
    ]);
    const sessionsToAdd = candidate.data.sessions
      .map(normalizeSession)
      .filter((session) => normalizeWindowScope(session.windowScope) === "regular")
      .filter((session) => {
        const duplicate =
          currentSessionKeys.has(session.id) || currentSessionKeys.has(sessionFingerprint(session));

        if (!duplicate) {
          currentSessionKeys.add(session.id);
          currentSessionKeys.add(sessionFingerprint(session));
        }

        return !duplicate;
      });
    const currentAttemptIds = new Set(currentAttempts.map((attempt) => attempt.id));
    const blockAttemptsToAdd = candidate.data.blockAttempts.filter(
      (attempt) =>
        normalizeWindowScope(attempt.windowScope) === "regular" &&
        !currentAttemptIds.has(attempt.id)
    );
    const conflicts: SyncConflict[] = [];
    const blockedMerge = mergeKeyed(
      currentSettings.blockedDomains,
      incomingBlockedSites,
      blockedKey,
      summarizeBlocked,
      "blocked-site",
      resolution,
      conflicts
    );
    const timeLimitMerge = mergeKeyed(
      currentSettings.timeLimitedDomains,
      incomingTimeLimits,
      timeLimitKey,
      summarizeTimeLimit,
      "time-limit",
      resolution,
      conflicts
    );
    const breakMerge = mergeKeyed(
      currentSettings.scheduledBreakRules,
      incomingBreakRules,
      breakKey,
      summarizeBreak,
      "scheduled-break",
      resolution,
      conflicts
    );
    const frictionMerge = mergeKeyed(
      currentVisionSettings.frictionRules,
      candidate.data.frictionRules,
      frictionKey,
      summarizeFriction,
      "friction-rule",
      resolution,
      conflicts
    );
    const categoriesMerge = mergeSiteCategories(
      currentCategories,
      candidate.data.siteCategories,
      resolution,
      conflicts
    );
    const incomingVision = candidate.data.visionSettings;
    const visionSettingsConflict =
      incomingVision !== null &&
      (incomingVision.adaptiveRecommendationsEnabled !==
        currentVisionSettings.adaptiveRecommendationsEnabled ||
        incomingVision.adaptiveEnforcementEnabled !==
          currentVisionSettings.adaptiveEnforcementEnabled ||
        incomingVision.maxAutomaticFrictionLevel !==
          currentVisionSettings.maxAutomaticFrictionLevel);

    if (visionSettingsConflict && incomingVision) {
      addConflict(
        conflicts,
        "vision-settings",
        "Vision settings",
        "current adaptive settings",
        "imported adaptive settings"
      );
    }

    const useImportedVision = resolution === "use-imported" && incomingVision !== null;
    const visionSettings: VisionSettings = {
      ...(useImportedVision ? incomingVision : currentVisionSettings),
      schemaVersion: 1,
      dismissedRecommendationIds: [
        ...new Set([
          ...currentVisionSettings.dismissedRecommendationIds,
          ...(incomingVision?.dismissedRecommendationIds ?? [])
        ])
      ],
      frictionRules: frictionMerge.merged,
      createdAt: Math.min(currentVisionSettings.createdAt, incomingVision?.createdAt ?? now),
      updatedAt: now
    };
    const settings: ExtensionSettings = {
      ...currentSettings,
      ...(candidate.data.settingsSubset ?? {}),
      schemaVersion: 1,
      blockedDomains: blockedMerge.merged,
      timeLimitedDomains: timeLimitMerge.merged,
      scheduledBreakRules: breakMerge.merged,
      ignoredDomains: [
        ...new Set([
          ...currentSettings.ignoredDomains,
          ...(candidate.data.settingsSubset?.ignoredDomains ?? [])
        ])
      ],
      privateBrowserTrackingEnabled: currentSettings.privateBrowserTrackingEnabled,
      createdAt: currentSettings.createdAt,
      updatedAt: now
    };
    const duplicateSessionsSkipped =
      candidate.data.sessions.filter(
        (session) => normalizeWindowScope(session.windowScope) === "regular"
      ).length - sessionsToAdd.length;

    return {
      preview: {
        valid: true,
        sourceBrowser: candidate.sourceBrowser,
        sourceExtensionId: candidate.sourceExtensionId,
        exportedAt: candidate.exportedAt,
        includesPrivateData: candidate.includesPrivateData,
        sessionsToAdd: sessionsToAdd.length,
        duplicateSessionsSkipped,
        blockAttemptsToAdd: blockAttemptsToAdd.length,
        blockedSitesToAdd: blockedMerge.added,
        blockedSitesToUpdate: blockedMerge.updated,
        timeLimitsToAdd: timeLimitMerge.added,
        timeLimitsToUpdate: timeLimitMerge.updated,
        scheduledBreaksToAdd: breakMerge.added,
        scheduledBreaksToUpdate: breakMerge.updated,
        frictionRulesToAdd: frictionMerge.added,
        frictionRulesToUpdate: frictionMerge.updated,
        siteCategoriesToAdd: categoriesMerge.added,
        siteCategoriesToUpdate: categoriesMerge.updated,
        visionSettingsToMerge: incomingVision !== null,
        conflicts
      },
      sessionsToAdd,
      blockAttemptsToAdd,
      settings,
      visionSettings,
      siteCategories: categoriesMerge.merged
    };
  }

  private async readSiteCategories(): Promise<unknown[]> {
    const result = (await this.storageArea.get(VISION_CLASSIFICATIONS_STORAGE_KEY)) as Record<
      string,
      unknown
    >;

    return Array.isArray(result[VISION_CLASSIFICATIONS_STORAGE_KEY])
      ? result[VISION_CLASSIFICATIONS_STORAGE_KEY]
      : [];
  }

  private async getOrCreateDeviceId(): Promise<string> {
    const result = (await this.storageArea.get(LOCAL_SYNC_DEVICE_ID_STORAGE_KEY)) as Record<
      string,
      unknown
    >;
    const existing = result[LOCAL_SYNC_DEVICE_ID_STORAGE_KEY];

    if (typeof existing === "string" && existing.length > 0) {
      return existing;
    }

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${this.now()}-${Math.random().toString(16).slice(2)}`;
    await this.storageArea.set({ [LOCAL_SYNC_DEVICE_ID_STORAGE_KEY]: id });
    return id;
  }

  private async readDiagnosticsMetadata(): Promise<SyncDiagnosticsMetadata> {
    const result = (await this.storageArea.get(LOCAL_SYNC_DIAGNOSTICS_STORAGE_KEY)) as Record<
      string,
      unknown
    >;
    const value = result[LOCAL_SYNC_DIAGNOSTICS_STORAGE_KEY];

    if (!isPlainObject(value)) {
      return {};
    }

    return {
      lastExportAt: typeof value.lastExportAt === "number" ? value.lastExportAt : undefined,
      lastImportAt: typeof value.lastImportAt === "number" ? value.lastImportAt : undefined,
      lastImportSourceBrowser:
        value.lastImportSourceBrowser === "firefox" ||
        value.lastImportSourceBrowser === "chrome" ||
        value.lastImportSourceBrowser === "edge" ||
        value.lastImportSourceBrowser === "opera" ||
        value.lastImportSourceBrowser === "safari" ||
        value.lastImportSourceBrowser === "unknown"
          ? value.lastImportSourceBrowser
          : undefined,
      lastImportSourceExtensionId:
        typeof value.lastImportSourceExtensionId === "string"
          ? value.lastImportSourceExtensionId
          : null
    };
  }

  private async updateDiagnosticsMetadata(changes: SyncDiagnosticsMetadata): Promise<void> {
    const current = await this.readDiagnosticsMetadata();
    await this.storageArea.set({
      [LOCAL_SYNC_DIAGNOSTICS_STORAGE_KEY]: {
        ...current,
        ...changes
      }
    });
  }

  private async checksum(bundle: SyncBundle): Promise<string> {
    const clone = { ...bundle, checksum: undefined };
    const payload = new TextEncoder().encode(JSON.stringify(clone));

    if (crypto.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", payload);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    return String(payload.reduce((sum, byte) => (sum + byte) % 1_000_000_007, 0));
  }
}
