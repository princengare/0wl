import type { BlockRuleManager } from "../blocking/BlockRuleManager";
import type { ExtensionLifecycleManager } from "../lifecycle/ExtensionLifecycleManager";
import type { TimeLimitManager } from "../timeLimits/TimeLimitManager";
import type { TrackingEngine } from "./TrackingEngine";
import type { SettingsStore } from "@/storage/SettingsStore";
import type { FrictionRuleManager } from "@/vision/friction/FrictionRuleManager";
import type { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import { browser } from "@/shared/browser";
import { addAlarmListener } from "@/platform/alarmsApi";
import { addIdleStateChangedListener, setIdleDetectionInterval } from "@/platform/idleApi";
import {
  BLOCK_RULE_ALARM_NAME,
  FRICTION_RULE_ALARM_NAME,
  VISION_SETTINGS_STORAGE_KEY
} from "@/shared/constants";
import type { ReconcileReason } from "@/shared/types";

interface TrackingEventHandlerDependencies {
  trackingEngine: TrackingEngine;
  settingsStore: SettingsStore;
  blockRuleManager: BlockRuleManager;
  timeLimitManager: TimeLimitManager;
  visionSettingsStore: VisionSettingsStore;
  frictionRuleManager: FrictionRuleManager;
  lifecycleManager: ExtensionLifecycleManager;
  bootstrap: (reason: ReconcileReason) => Promise<void>;
}

function runSafely(task: Promise<unknown>): void {
  task.catch((error) => {
    console.error("Background task failed", error);
  });
}

export function registerTrackingEventHandlers({
  trackingEngine,
  settingsStore,
  blockRuleManager,
  timeLimitManager,
  visionSettingsStore,
  frictionRuleManager,
  lifecycleManager,
  bootstrap
}: TrackingEventHandlerDependencies): void {
  const reconcileAndRefresh = async (reason: ReconcileReason): Promise<void> => {
    await trackingEngine.reconcileTrackingState(reason);
    await timeLimitManager.refresh();
  };

  browser.runtime.onInstalled.addListener((details) => {
    runSafely(lifecycleManager.handleInstalled(details));
  });

  browser.runtime.onStartup.addListener(() => {
    runSafely(bootstrap("startup"));
  });

  browser.tabs.onActivated.addListener(() => {
    runSafely(reconcileAndRefresh("tab-activated"));
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url) {
      runSafely(reconcileAndRefresh("navigation"));
    }
  });

  browser.tabs.onRemoved.addListener(() => {
    runSafely(reconcileAndRefresh("tab-closed"));
  });

  browser.windows.onFocusChanged.addListener((windowId) => {
    const reason =
      windowId === browser.windows.WINDOW_ID_NONE ? "window-blurred" : "window-focused";
    runSafely(reconcileAndRefresh(reason));
  });

  addIdleStateChangedListener((state) => {
    runSafely(reconcileAndRefresh(state === "active" ? "idle-resumed" : "idle"));
  });

  addAlarmListener((alarm) => {
    runSafely(
      (async () => {
        if (alarm.name === BLOCK_RULE_ALARM_NAME) {
          const settings = await settingsStore.get();
          await blockRuleManager.refreshDynamicRules(settings.blockedDomains);
          await timeLimitManager.refresh();
          return;
        }

        if (alarm.name === FRICTION_RULE_ALARM_NAME) {
          const settings = await visionSettingsStore.get();
          await frictionRuleManager.refreshDynamicRules(settings.frictionRules);
          return;
        }

        await timeLimitManager.handleAlarm(alarm.name);
      })()
    );
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    runSafely(
      (async () => {
        if (changes.settings) {
          const settings = await settingsStore.get();
          setIdleDetectionInterval(settings.idleThresholdSeconds);
          await blockRuleManager.refreshDynamicRules(settings.blockedDomains);
          await trackingEngine.reconcileTrackingState(
            settings.trackingEnabled ? "settings-changed" : "tracking-disabled"
          );
          await timeLimitManager.refresh();
        }

        if (changes[VISION_SETTINGS_STORAGE_KEY]) {
          const settings = await visionSettingsStore.get();
          await frictionRuleManager.refreshDynamicRules(settings.frictionRules);
        }
      })()
    );
  });
}
