import type {
  ActiveBrowserContext,
  EndReason,
  ExtensionSettings,
  PersistedTrackingState,
  PersistedTrackingStatus,
  ReconcileReason,
  StartReason
} from "@/shared/types";

export function isStartupRecoveryReason(reason: ReconcileReason): boolean {
  return reason === "startup" || reason === "installed";
}

export function deriveDesiredStatus(
  settings: ExtensionSettings,
  context: ActiveBrowserContext | null
): PersistedTrackingStatus {
  if (!settings.trackingEnabled) {
    return "disabled";
  }

  if (!context) {
    return "inactive";
  }

  if (context.idleState === "idle" || context.idleState === "locked") {
    return "idle";
  }

  if (!context.browserFocused) {
    return "browser-unfocused";
  }

  if (!context.trackable || !context.domain) {
    return "inactive";
  }

  return "tracking";
}

export function startReasonFromReconcile(reason: ReconcileReason): StartReason {
  switch (reason) {
    case "tab-activated":
      return "tab-activated";
    case "navigation":
      return "navigation";
    case "idle-resumed":
      return "idle-resumed";
    case "window-focused":
    case "settings-changed":
    case "manual":
    case "background-wakeup":
    case "tab-closed":
    case "window-blurred":
    case "idle":
    case "tracking-disabled":
      return "window-focused";
    case "startup":
    case "installed":
      return "startup";
  }
}

export function endReasonFromReconcile(
  reason: ReconcileReason,
  desiredStatus: PersistedTrackingStatus
): EndReason {
  if (desiredStatus === "disabled" || reason === "tracking-disabled") {
    return "tracking-disabled";
  }

  switch (reason) {
    case "tab-activated":
      return "tab-switched";
    case "navigation":
      return "navigation";
    case "window-blurred":
      return "window-blurred";
    case "idle":
      return "idle";
    case "tab-closed":
      return "tab-closed";
    case "startup":
    case "installed":
    case "background-wakeup":
    case "settings-changed":
    case "manual":
    case "window-focused":
    case "idle-resumed":
      return "browser-recovery";
  }
}

export function makeInactiveState(
  previous: PersistedTrackingState,
  status: Exclude<PersistedTrackingStatus, "tracking">,
  now: number,
  activeTabId: number | null,
  activeWindowId: number | null,
  domain: string | null
): PersistedTrackingState {
  return {
    status,
    activeTabId,
    activeWindowId,
    domain,
    sessionStartedAt: null,
    lastTransitionAt: now,
    revision: previous.revision + 1
  };
}

export function makeTrackingState(
  previous: PersistedTrackingState,
  now: number,
  activeTabId: number | null,
  activeWindowId: number | null,
  domain: string,
  sessionStartedAt = now
): PersistedTrackingState {
  return {
    status: "tracking",
    activeTabId,
    activeWindowId,
    domain,
    sessionStartedAt,
    lastTransitionAt: now,
    revision: previous.revision + 1
  };
}
