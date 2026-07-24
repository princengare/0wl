import { BlockAttemptRecorder } from "./blocking/BlockAttemptRecorder";
import { BlockRuleManager } from "./blocking/BlockRuleManager";
import { ScheduledBreakManager } from "./breaks/ScheduledBreakManager";
import { DataControlService } from "./dataControl/DataControlService";
import { ExtensionLifecycleManager } from "./lifecycle/ExtensionLifecycleManager";
import { registerMessageRouter } from "./messaging/messageRouter";
import { MediaActivityTracker } from "./media/MediaActivityTracker";
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
import { LocalDeviceSyncService } from "@/sync/LocalDeviceSyncService";
import { browser } from "@/shared/browser";
import { setIdleDetectionInterval } from "@/platform/idleApi";
import type { ReconcileReason } from "@/shared/types";
import { DomainClassifier } from "@/vision/classification/DomainClassifier";
import { BrowsingIntentRepository } from "@/vision/friction/BrowsingIntentRepository";
import { FrictionRuleManager } from "@/vision/friction/FrictionRuleManager";
import { IntentPromptManager } from "@/vision/friction/IntentPromptManager";
import { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import { TransitionRecorder } from "@/vision/transitions/TransitionRecorder";
import { TransitionRepository } from "@/vision/transitions/TransitionRepository";
import { VisionReportService } from "@/vision/VisionReportService";

type BackgroundServices = ReturnType<typeof createBackgroundServices>;

let initializationPromise: Promise<void> | null = null;
let backgroundServices: BackgroundServices | null = null;

function createBackgroundServices() {
  const settingsStore = new SettingsStore();
  const runtimeStateStore = new RuntimeStateStore();
  const lifecycleStore = new LifecycleStore();
  const sessionRepository = new SessionRepository();
  const dailyUsageRepository = new DailyUsageRepository();
  const blockAttemptRepository = new BlockAttemptRepository();
  const transitionRepository = new TransitionRepository();
  const browsingIntentRepository = new BrowsingIntentRepository();
  const domainClassifier = new DomainClassifier();
  const visionSettingsStore = new VisionSettingsStore();
  const intentPromptManager = new IntentPromptManager(browsingIntentRepository);
  const blockRuleManager = new BlockRuleManager();
  const timeLimitRuleManager = new TimeLimitRuleManager();
  const frictionRuleManager = new FrictionRuleManager();
  const activeContextResolver = new ActiveContextResolver();
  const transitionRecorder = new TransitionRecorder(transitionRepository, domainClassifier);
  const sessionManager = new SessionManager(
    sessionRepository,
    dailyUsageRepository,
    transitionRecorder
  );
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
    timeLimitRuleManager,
    trackingEngine
  });
  const scheduledBreakManager = new ScheduledBreakManager({
    settingsStore,
    runtimeStateStore,
    sessionRepository,
    trackingEngine
  });
  const mediaActivityTracker = new MediaActivityTracker({
    settingsStore,
    sessionRepository,
    activeContextResolver
  });
  const lifecycleManager = new ExtensionLifecycleManager({
    lifecycleStore,
    bootstrap
  });
  const visionReportService = new VisionReportService({
    sessionRepository,
    blockAttemptRepository,
    transitionRepository,
    settingsStore,
    visionSettingsStore,
    domainClassifier
  });
  const dataControlService = new DataControlService({
    settingsStore,
    runtimeStateStore,
    visionSettingsStore,
    blockRuleManager,
    timeLimitManager,
    frictionRuleManager,
    trackingEngine,
    seedSiteCategoryCount: domainClassifier.seedCount
  });
  const localDeviceSyncService = new LocalDeviceSyncService({
    settingsStore,
    visionSettingsStore,
    blockRuleManager,
    timeLimitManager,
    scheduledBreakManager,
    frictionRuleManager
  });

  return {
    settingsStore,
    runtimeStateStore,
    lifecycleStore,
    sessionRepository,
    dailyUsageRepository,
    blockAttemptRepository,
    transitionRepository,
    browsingIntentRepository,
    domainClassifier,
    visionSettingsStore,
    intentPromptManager,
    visionReportService,
    dataControlService,
    localDeviceSyncService,
    blockRuleManager,
    timeLimitRuleManager,
    frictionRuleManager,
    activeContextResolver,
    sessionManager,
    trackingEngine,
    mediaActivityTracker,
    blockAttemptRecorder,
    timeLimitManager,
    scheduledBreakManager,
    lifecycleManager
  };
}

function getBackgroundServices(): BackgroundServices {
  backgroundServices ??= createBackgroundServices();
  return backgroundServices;
}

async function initializeCore(services: BackgroundServices): Promise<void> {
  await runMigrations();
  const settingsMigration = await services.settingsStore.migrateStoredSettings();
  await services.dataControlService.repairUsageData();
  const settings = settingsMigration.settings;
  setIdleDetectionInterval(settings.idleThresholdSeconds);
  await services.blockRuleManager.refreshDynamicRules(
    settings.blockedDomains,
    Date.now(),
    settings.privateBrowserTrackingEnabled
  );
  await services.frictionRuleManager.refreshDynamicRules(
    (await services.visionSettingsStore.get()).frictionRules
  );

  if (settingsMigration.changed) {
    await services.lifecycleStore.recordMigration(browser.runtime.getManifest().version);
  }
}

export async function bootstrap(reason: ReconcileReason): Promise<void> {
  const services = getBackgroundServices();
  initializationPromise ??= initializeCore(services);
  await initializationPromise;
  await services.mediaActivityTracker.recoverConservatively(
    reason === "startup" ? "startup" : "background-wakeup"
  );
  await services.trackingEngine.bootstrap(reason);
  const settings = await services.settingsStore.get();
  await services.timeLimitManager.refresh();
  await services.scheduledBreakManager.refresh();
  await services.blockRuleManager.enforceMatchingTabs(settings);
}

export function registerBackgroundListeners(): void {
  const services = getBackgroundServices();
  registerMessageRouter(services);
  registerTrackingEventHandlers({
    trackingEngine: services.trackingEngine,
    settingsStore: services.settingsStore,
    blockRuleManager: services.blockRuleManager,
    mediaActivityTracker: services.mediaActivityTracker,
    timeLimitManager: services.timeLimitManager,
    scheduledBreakManager: services.scheduledBreakManager,
    visionSettingsStore: services.visionSettingsStore,
    frictionRuleManager: services.frictionRuleManager,
    lifecycleManager: services.lifecycleManager,
    bootstrap
  });
}
