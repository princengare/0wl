import type { BlockRuleManager } from "../blocking/BlockRuleManager";
import type { ExtensionLifecycleManager } from "../lifecycle/ExtensionLifecycleManager";
import type { MediaActivityTracker } from "../media/MediaActivityTracker";
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
  mediaActivityTracker: MediaActivityTracker;
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
  mediaActivityTracker,
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
    await mediaActivityTracker.reconcile(reason);
    await timeLimitManager.refresh();
    const settings = await settingsStore.get();
    await blockRuleManager.enforceMatchingTabs(settings);
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

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      runSafely(
        (async () => {
          await mediaActivityTracker.handleNavigation(tabId);
          await reconcileAndRefresh("navigation");
        })()
      );
      return;
    }

    if ("audible" in changeInfo) {
      runSafely(mediaActivityTracker.reconcile("media-report"));
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    runSafely(
      (async () => {
        await mediaActivityTracker.handleTabRemoved(tabId);
        await reconcileAndRefresh("tab-closed");
      })()
    );
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
          await blockRuleManager.refreshDynamicRules(
            settings.blockedDomains,
            Date.now(),
            settings.privateBrowserTrackingEnabled
          );
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
          await blockRuleManager.refreshDynamicRules(
            settings.blockedDomains,
            Date.now(),
            settings.privateBrowserTrackingEnabled
          );
          await trackingEngine.reconcileTrackingState(
            settings.trackingEnabled ? "settings-changed" : "tracking-disabled"
          );
          await mediaActivityTracker.reconcile("settings-changed");
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
