import { BlockAttemptRecorder } from "./blocking/BlockAttemptRecorder";
import { BlockRuleManager } from "./blocking/BlockRuleManager";
import { ExtensionLifecycleManager } from "./lifecycle/ExtensionLifecycleManager";
import { registerMessageRouter } from "./messaging/messageRouter";
import { ActiveContextResolver } from "./tracking/ActiveContextResolver";
import { SessionManager } from "./tracking/SessionManager";
import { TrackingEngine } from "./tracking/TrackingEngine";
import { registerTrackingEventHandlers } from "./tracking/TrackingEventHandlers";
import { TimeLimitManager } from "./timeLimits/TimeLimitManager";
import { TimeLimitRuleManager } from "./timeLimits/TimeLimitRuleManager";
import { runMigrations } from "@/db/migrations";
import { BlockAttemptRepository } from "@/db/repositories/BlockAttemptRepository";
import { DailyUsageRepository } from "@/db/repositories/DailyUsageRepository";
import { SessionRepository } from "@/db/repositories/SessionRepository";
import { LifecycleStore } from "@/storage/LifecycleStore";
import { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import { SettingsStore } from "@/storage/SettingsStore";
import type { ReconcileReason } from "@/shared/types";

const settingsStore = new SettingsStore();
const runtimeStateStore = new RuntimeStateStore();
const lifecycleStore = new LifecycleStore();
const sessionRepository = new SessionRepository();
const dailyUsageRepository = new DailyUsageRepository();
const blockAttemptRepository = new BlockAttemptRepository();
const blockRuleManager = new BlockRuleManager();
const timeLimitRuleManager = new TimeLimitRuleManager();
const activeContextResolver = new ActiveContextResolver();
const sessionManager = new SessionManager(sessionRepository, dailyUsageRepository);
const trackingEngine = new TrackingEngine({
  settingsStore,
  runtimeStateStore,
  activeContextResolver,
  sessionManager
});
const blockAttemptRecorder = new BlockAttemptRecorder(settingsStore, blockAttemptRepository);
const timeLimitManager = new TimeLimitManager({
  settingsStore,
  runtimeStateStore,
  dailyUsageRepository,
  sessionRepository,
  timeLimitRuleManager
});
const lifecycleManager = new ExtensionLifecycleManager({
  lifecycleStore,
  bootstrap
});

let initializationPromise: Promise<void> | null = null;

export const backgroundServices = {
  settingsStore,
  runtimeStateStore,
  lifecycleStore,
  sessionRepository,
  dailyUsageRepository,
  blockAttemptRepository,
  blockRuleManager,
  timeLimitRuleManager,
  activeContextResolver,
  sessionManager,
  trackingEngine,
  blockAttemptRecorder,
  timeLimitManager,
  lifecycleManager
};

async function initializeCore(): Promise<void> {
  await runMigrations();
  const settingsMigration = await settingsStore.migrateStoredSettings();
  const settings = settingsMigration.settings;
  browser.idle.setDetectionInterval(settings.idleThresholdSeconds);
  await blockRuleManager.refreshDynamicRules(settings.blockedDomains);
  await timeLimitManager.refresh();

  if (settingsMigration.changed) {
    await lifecycleStore.recordMigration(browser.runtime.getManifest().version);
  }
}

export async function bootstrap(reason: ReconcileReason): Promise<void> {
  initializationPromise ??= initializeCore();
  await initializationPromise;
  await trackingEngine.bootstrap(reason);
}

export function registerBackgroundListeners(): void {
  registerMessageRouter(backgroundServices);
  registerTrackingEventHandlers({
    trackingEngine,
    settingsStore,
    blockRuleManager,
    timeLimitManager,
    lifecycleManager,
    bootstrap
  });
}
