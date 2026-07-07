import type { BlockRuleManager } from "../blocking/BlockRuleManager";
import type { ExtensionLifecycleManager } from "../lifecycle/ExtensionLifecycleManager";
import type { TimeLimitManager } from "../timeLimits/TimeLimitManager";
import type { TrackingEngine } from "./TrackingEngine";
import type { SettingsStore } from "@/storage/SettingsStore";
import type { ReconcileReason } from "@/shared/types";

interface TrackingEventHandlerDependencies {
  trackingEngine: TrackingEngine;
  settingsStore: SettingsStore;
  blockRuleManager: BlockRuleManager;
  timeLimitManager: TimeLimitManager;
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

  browser.idle.onStateChanged.addListener((state) => {
    runSafely(reconcileAndRefresh(state === "active" ? "idle-resumed" : "idle"));
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    runSafely(timeLimitManager.handleAlarm(alarm.name));
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.settings) {
      return;
    }

    runSafely(
      (async () => {
        const settings = await settingsStore.get();
        browser.idle.setDetectionInterval(settings.idleThresholdSeconds);
        await blockRuleManager.syncDynamicRules(settings.blockedDomains);
        await trackingEngine.reconcileTrackingState(
          settings.trackingEnabled ? "settings-changed" : "tracking-disabled"
        );
        await timeLimitManager.refresh();
      })()
    );
  });
}
