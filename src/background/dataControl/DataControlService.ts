import {
  STORE_BLOCK_ATTEMPTS,
  STORE_BROWSING_INTENTS,
  STORE_DAILY_USAGE,
  STORE_DOMAIN_TRANSITIONS,
  STORE_SESSIONS
} from "@/db/schema";
import { openDatabase, requestToPromise, transactionDone } from "@/db/database";
import {
  LIFECYCLE_STORAGE_KEY,
  RUNTIME_SESSION_META_STORAGE_KEY,
  RUNTIME_STATE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  VISION_CLASSIFICATIONS_STORAGE_KEY,
  VISION_SETTINGS_STORAGE_KEY
} from "@/shared/constants";
import { browser as extensionBrowser } from "@/shared/browser";
import { getDateKey, startOfLocalDay } from "@/shared/time";
import { isPlainObject } from "@/shared/validation";
import { setIdleDetectionInterval } from "@/platform/idleApi";
import { createDefaultSettings } from "@/storage/defaults";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { BlockRuleManager } from "../blocking/BlockRuleManager";
import type { TimeLimitManager } from "../timeLimits/TimeLimitManager";
import type { TrackingEngine } from "../tracking/TrackingEngine";
import type { FrictionRuleManager } from "@/vision/friction/FrictionRuleManager";
import type { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import type { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import type { SettingsStore } from "@/storage/SettingsStore";
import type {
  BlockAttempt,
  DataBackup,
  DataControlStatus,
  DataDeleteTarget,
  DataExportResult,
  DataImportMode,
  DailyUsage,
  ExtensionSettings,
  HistoryRetentionDays,
  TimeLimitedDomain,
  UsageSession
} from "@/shared/types";
import type { DomainTransition, VisionSettings } from "@/vision/types";

type StorageArea = browser.storage.StorageArea;
type StoreName =
  | typeof STORE_SESSIONS
  | typeof STORE_DAILY_USAGE
  | typeof STORE_BLOCK_ATTEMPTS
  | typeof STORE_DOMAIN_TRANSITIONS
  | typeof STORE_BROWSING_INTENTS;

interface DataControlDependencies {
  settingsStore: SettingsStore;
  runtimeStateStore: RuntimeStateStore;
  visionSettingsStore: VisionSettingsStore;
  blockRuleManager: BlockRuleManager;
  timeLimitManager: TimeLimitManager;
  frictionRuleManager: FrictionRuleManager;
  trackingEngine: TrackingEngine;
  seedSiteCategoryCount: number;
  storageArea?: StorageArea;
  now?: () => number;
}

const STORES = [
  STORE_SESSIONS,
  STORE_DAILY_USAGE,
  STORE_BLOCK_ATTEMPTS,
  STORE_DOMAIN_TRANSITIONS,
  STORE_BROWSING_INTENTS
] as const;

const USER_STORAGE_KEYS = [
  SETTINGS_STORAGE_KEY,
  VISION_SETTINGS_STORAGE_KEY,
  VISION_CLASSIFICATIONS_STORAGE_KEY
] as const;

const RESET_STORAGE_KEYS = [
  ...USER_STORAGE_KEYS,
  RUNTIME_STATE_STORAGE_KEY,
  RUNTIME_SESSION_META_STORAGE_KEY,
  LIFECYCLE_STORAGE_KEY
] as const;

function isDataBackup(value: unknown): value is DataBackup {
  return (
    isPlainObject(value) &&
    value.app === "0wl" &&
    value.schemaVersion === 1 &&
    isPlainObject(value.database) &&
    Array.isArray(value.database.sessions) &&
    Array.isArray(value.database.dailyUsage) &&
    Array.isArray(value.database.blockAttempts) &&
    Array.isArray(value.database.domainTransitions) &&
    Array.isArray(value.database.browsingIntents) &&
    isPlainObject(value.storage)
  );
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function minFinite(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length > 0 ? Math.min(...finite) : null;
}

function mergeDomainKey(item: { domain: string | null; windowScope?: unknown; targetType?: unknown }): string {
  return `${normalizeWindowScope(item.windowScope)}::${String(item.targetType ?? "domain")}::${
    item.domain ?? "all-browsing"
  }`;
}

function mergeByDomain<T extends { domain: string | null; windowScope?: unknown; targetType?: unknown }>(
  current: T[],
  incoming: T[]
): T[] {
  const byDomain = new Map(current.map((item) => [mergeDomainKey(item), item]));

  for (const item of incoming) {
    if (typeof item?.domain === "string" || item?.domain === null) {
      byDomain.set(mergeDomainKey(item), item);
    }
  }

  return [...byDomain.values()].sort((a, b) =>
    (a.domain ?? "All Browsing").localeCompare(b.domain ?? "All Browsing")
  );
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));

  for (const item of incoming) {
    if (typeof item?.id === "string") {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()];
}

function mergeClassifications(current: unknown[], incoming: unknown[]): unknown[] {
  const byDomain = new Map<string, unknown>();

  for (const item of [...current, ...incoming]) {
    if (isPlainObject(item) && typeof item.domain === "string") {
      byDomain.set(item.domain, item);
    }
  }

  return [...byDomain.values()];
}

async function listStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const rows = await requestToPromise(transaction.objectStore(storeName).getAll());
  await transactionDone(transaction);
  return rows as T[];
}

async function countStore(storeName: StoreName): Promise<number> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const count = await requestToPromise(transaction.objectStore(storeName).count());
  await transactionDone(transaction);
  return count;
}

async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
}

async function putRows<T>(storeName: StoreName, rows: T[]): Promise<void> {
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

async function keepRows<T>(storeName: StoreName, keep: (row: T) => boolean): Promise<void> {
  const rows = await listStore<T>(storeName);
  await clearStore(storeName);
  await putRows(
    storeName,
    rows.filter((row) => keep(row))
  );
}

function isPrivateScoped(row: { windowScope?: unknown }): boolean {
  return normalizeWindowScope(row.windowScope) === "private";
}

export class DataControlService {
  private readonly storageArea: StorageArea;

  constructor(private readonly dependencies: DataControlDependencies) {
    this.storageArea = dependencies.storageArea ?? extensionBrowser.storage.local;
  }

  async getStatus(): Promise<DataControlStatus> {
    const [
      sessions,
      dailyUsageRecords,
      blockedAttemptRows,
      domainTransitions,
      browsingIntents,
      storage,
      backup
    ] = await Promise.all([
      listStore<UsageSession>(STORE_SESSIONS),
      countStore(STORE_DAILY_USAGE),
      listStore<BlockAttempt>(STORE_BLOCK_ATTEMPTS),
      listStore<DomainTransition>(STORE_DOMAIN_TRANSITIONS),
      listStore<{ startedAt?: number }>(STORE_BROWSING_INTENTS),
      this.readUserStorage(),
      this.buildBackup()
    ]);
    const estimate =
      "storage" in navigator && typeof navigator.storage?.estimate === "function"
        ? await navigator.storage.estimate().catch(() => null)
        : null;
    const customClassifications = Array.isArray(storage.visionDomainClassifications)
      ? storage.visionDomainClassifications
      : [];
    const settings = await this.dependencies.settingsStore.get(this.now());
    const oldestRecordAt = minFinite([
      ...sessions.map((session) => session.startedAt),
      ...blockedAttemptRows.map((attempt) => attempt.attemptedAt),
      ...domainTransitions.map((transition) => transition.transitionedAt),
      ...browsingIntents.map((intent) => intent.startedAt),
      storage.settings?.createdAt,
      storage.visionSettings?.createdAt,
      ...customClassifications.map((classification) =>
        isPlainObject(classification) && typeof classification.createdAt === "number"
          ? classification.createdAt
          : null
      )
    ]);

    return {
      sessions: sessions.length,
      dailyUsageRecords,
      blockedAttempts: blockedAttemptRows.reduce((sum, attempt) => sum + attempt.count, 0),
      visionEvents: domainTransitions.length + browsingIntents.length,
      seedSiteCategories: this.dependencies.seedSiteCategoryCount,
      customSiteCategories: customClassifications.length,
      oldestRecordAt,
      storageUsedBytes: estimate?.usage ?? jsonByteLength(backup),
      historyRetentionDays: settings.historyRetentionDays
    };
  }

  async exportAllData(): Promise<DataExportResult> {
    const backup = await this.buildBackup();

    return {
      fileName: `0wl-backup-${getDateKey(backup.exportedAt)}.json`,
      backup
    };
  }

  async importBackup(candidate: unknown, mode: DataImportMode): Promise<DataControlStatus> {
    if (!isDataBackup(candidate)) {
      throw new Error("Choose a valid 0wl backup file.");
    }

    if (mode !== "merge" && mode !== "replace") {
      throw new Error("Choose a valid import mode.");
    }

    if (mode === "replace") {
      await this.clearAllStores();
      await this.storageArea.remove([...USER_STORAGE_KEYS]);
    }

    await this.importDatabase(candidate.database);
    await this.importStorage(candidate.storage, mode);
    await this.dependencies.runtimeStateStore.resetInactive(this.now());
    await this.refreshSideEffects();
    return this.getStatus();
  }

  async setHistoryRetention(
    historyRetentionDays: HistoryRetentionDays
  ): Promise<DataControlStatus> {
    await this.dependencies.settingsStore.update({ historyRetentionDays }, this.now());
    await this.applyHistoryRetention(historyRetentionDays);
    await this.refreshSideEffects();
    return this.getStatus();
  }

  async deleteTarget(target: DataDeleteTarget): Promise<DataControlStatus> {
    switch (target) {
      case "browsing-history":
        await clearStore(STORE_SESSIONS);
        await clearStore(STORE_DAILY_USAGE);
        break;
      case "blocked-attempts":
        await clearStore(STORE_BLOCK_ATTEMPTS);
        break;
      case "vision-analytics":
        await clearStore(STORE_DOMAIN_TRANSITIONS);
        await clearStore(STORE_BROWSING_INTENTS);
        break;
      case "custom-site-categories":
        await this.storageArea.remove(VISION_CLASSIFICATIONS_STORAGE_KEY);
        break;
      case "settings":
        await this.resetSettingsOnly();
        break;
      default:
        throw new Error("Choose a valid data type to delete.");
    }

    await this.refreshSideEffects();
    return this.getStatus();
  }

  async clearPrivateBrowsingData(): Promise<DataControlStatus> {
    await keepRows<UsageSession>(STORE_SESSIONS, (session) => !isPrivateScoped(session));
    await keepRows<DailyUsage>(STORE_DAILY_USAGE, (row) => !isPrivateScoped(row));
    await keepRows<BlockAttempt>(STORE_BLOCK_ATTEMPTS, (attempt) => !isPrivateScoped(attempt));
    await keepRows<DomainTransition & { windowScope?: unknown }>(
      STORE_DOMAIN_TRANSITIONS,
      (transition) => !isPrivateScoped(transition)
    );
    await keepRows<{ windowScope?: unknown }>(
      STORE_BROWSING_INTENTS,
      (intent) => !isPrivateScoped(intent)
    );
    await this.dependencies.settingsStore.update(
      { privateBrowserTrackingEnabled: false },
      this.now()
    );
    await this.dependencies.runtimeStateStore.resetInactive(this.now());
    await this.refreshSideEffects();
    return this.getStatus();
  }

  async resetAllLocalData(confirmation: string): Promise<DataControlStatus> {
    if (confirmation !== "RESET 0WL") {
      throw new Error("Type RESET 0WL before resetting all local data.");
    }

    await this.clearAllStores();
    await this.storageArea.remove([...RESET_STORAGE_KEYS]);
    await this.resetSettingsOnly();
    await this.dependencies.runtimeStateStore.resetInactive(this.now());
    await this.refreshSideEffects();
    return this.getStatus();
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now();
  }

  private async buildBackup(): Promise<DataBackup> {
    const storage = await this.readUserStorage();

    return {
      app: "0wl",
      schemaVersion: 1,
      exportedAt: this.now(),
      version: extensionBrowser.runtime.getManifest().version,
      database: {
        sessions: await listStore<UsageSession>(STORE_SESSIONS),
        dailyUsage: await listStore<DailyUsage>(STORE_DAILY_USAGE),
        blockAttempts: await listStore<BlockAttempt>(STORE_BLOCK_ATTEMPTS),
        domainTransitions: await listStore<DomainTransition>(STORE_DOMAIN_TRANSITIONS),
        browsingIntents: await listStore(STORE_BROWSING_INTENTS)
      },
      storage
    };
  }

  private async readUserStorage(): Promise<DataBackup["storage"]> {
    const result = (await this.storageArea.get([...USER_STORAGE_KEYS])) as Record<string, unknown>;

    return {
      settings: (result[SETTINGS_STORAGE_KEY] as ExtensionSettings | undefined) ?? null,
      visionSettings: (result[VISION_SETTINGS_STORAGE_KEY] as VisionSettings | undefined) ?? null,
      visionDomainClassifications: Array.isArray(result[VISION_CLASSIFICATIONS_STORAGE_KEY])
        ? result[VISION_CLASSIFICATIONS_STORAGE_KEY]
        : []
    };
  }

  private async importDatabase(database: DataBackup["database"]): Promise<void> {
    await putRows(STORE_SESSIONS, database.sessions);
    await putRows(STORE_DAILY_USAGE, database.dailyUsage);
    await putRows(STORE_BLOCK_ATTEMPTS, database.blockAttempts);
    await putRows(STORE_DOMAIN_TRANSITIONS, database.domainTransitions);
    await putRows(STORE_BROWSING_INTENTS, database.browsingIntents);
  }

  private async importStorage(storage: DataBackup["storage"], mode: DataImportMode): Promise<void> {
    if (mode === "replace") {
      await this.storageArea.set({
        ...(storage.settings ? { [SETTINGS_STORAGE_KEY]: storage.settings } : {}),
        ...(storage.visionSettings ? { [VISION_SETTINGS_STORAGE_KEY]: storage.visionSettings } : {}),
        [VISION_CLASSIFICATIONS_STORAGE_KEY]: storage.visionDomainClassifications
      });
      await this.dependencies.settingsStore.migrateStoredSettings(this.now());
      await this.dependencies.visionSettingsStore.get(this.now());
      return;
    }

    const currentSettings = await this.dependencies.settingsStore.get(this.now());

    if (storage.settings) {
      const incoming = storage.settings;
      await this.dependencies.settingsStore.save({
        ...currentSettings,
        ...incoming,
        schemaVersion: 1,
        blockedDomains: mergeByDomain(currentSettings.blockedDomains, incoming.blockedDomains),
        timeLimitedDomains: mergeByDomain<TimeLimitedDomain>(
          currentSettings.timeLimitedDomains,
          incoming.timeLimitedDomains
        ),
        ignoredDomains: [...new Set([...currentSettings.ignoredDomains, ...incoming.ignoredDomains])],
        createdAt: Math.min(currentSettings.createdAt, incoming.createdAt),
        updatedAt: this.now()
      });
      await this.dependencies.settingsStore.migrateStoredSettings(this.now());
    }

    if (storage.visionSettings) {
      const currentVisionSettings = await this.dependencies.visionSettingsStore.get(this.now());
      const incoming = storage.visionSettings;
      await this.storageArea.set({
        [VISION_SETTINGS_STORAGE_KEY]: {
          ...currentVisionSettings,
          ...incoming,
          schemaVersion: 1,
          dismissedRecommendationIds: [
            ...new Set([
              ...currentVisionSettings.dismissedRecommendationIds,
              ...incoming.dismissedRecommendationIds
            ])
          ],
          frictionRules: mergeById(currentVisionSettings.frictionRules, incoming.frictionRules),
          createdAt: Math.min(currentVisionSettings.createdAt, incoming.createdAt),
          updatedAt: this.now()
        }
      });
      await this.dependencies.visionSettingsStore.get(this.now());
    }

    if (storage.visionDomainClassifications.length > 0) {
      const current = await this.readUserStorage();
      await this.storageArea.set({
        [VISION_CLASSIFICATIONS_STORAGE_KEY]: mergeClassifications(
          current.visionDomainClassifications,
          storage.visionDomainClassifications
        )
      });
    }
  }

  private async resetSettingsOnly(): Promise<void> {
    const now = this.now();
    await this.dependencies.settingsStore.save(createDefaultSettings(now));
    await this.storageArea.remove(VISION_SETTINGS_STORAGE_KEY);
  }

  private async applyHistoryRetention(historyRetentionDays: HistoryRetentionDays): Promise<void> {
    if (historyRetentionDays === null) {
      return;
    }

    const cutoff = startOfLocalDay(this.now()) - (historyRetentionDays - 1) * 24 * 60 * 60 * 1000;
    const cutoffDateKey = getDateKey(cutoff);

    await keepRows<UsageSession>(STORE_SESSIONS, (session) => session.endedAt >= cutoff);
    await keepRows<DailyUsage>(STORE_DAILY_USAGE, (row) => row.dateKey >= cutoffDateKey);
    await keepRows<DomainTransition>(
      STORE_DOMAIN_TRANSITIONS,
      (transition) => transition.transitionedAt >= cutoff
    );
    await keepRows<{ startedAt?: number }>(
      STORE_BROWSING_INTENTS,
      (intent) => typeof intent.startedAt === "number" && intent.startedAt >= cutoff
    );
  }

  private async clearAllStores(): Promise<void> {
    for (const store of STORES) {
      await clearStore(store);
    }
  }

  private async refreshSideEffects(): Promise<void> {
    const now = this.now();
    const settings = await this.dependencies.settingsStore.get(now);
    const visionSettings = await this.dependencies.visionSettingsStore.get(now);
    setIdleDetectionInterval(settings.idleThresholdSeconds);
    await this.dependencies.blockRuleManager.refreshDynamicRules(
      settings.blockedDomains,
      now,
      settings.privateBrowserTrackingEnabled
    );
    await this.dependencies.timeLimitManager.refresh();
    await this.dependencies.frictionRuleManager.refreshDynamicRules(visionSettings.frictionRules);
    await this.dependencies.trackingEngine.reconcileTrackingState(
      settings.trackingEnabled ? "settings-changed" : "tracking-disabled"
    );
  }
}
