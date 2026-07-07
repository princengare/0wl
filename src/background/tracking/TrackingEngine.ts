import type { ActiveContextResolver } from "./ActiveContextResolver";
import type { SessionManager } from "./SessionManager";
import {
  deriveDesiredStatus,
  endReasonFromReconcile,
  isStartupRecoveryReason,
  makeInactiveState,
  makeTrackingState,
  startReasonFromReconcile
} from "./TrackingState";
import type { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import type { SettingsStore } from "@/storage/SettingsStore";
import type {
  ActiveBrowserContext,
  PersistedTrackingState,
  PersistedTrackingStatus,
  ReconcileReason
} from "@/shared/types";

interface TrackingEngineDependencies {
  settingsStore: SettingsStore;
  runtimeStateStore: RuntimeStateStore;
  activeContextResolver: ActiveContextResolver;
  sessionManager: SessionManager;
  now?: () => number;
}

interface DesiredTrackingState {
  status: PersistedTrackingStatus;
  context: ActiveBrowserContext | null;
}

export class TrackingEngine {
  private queue: Promise<void> = Promise.resolve();
  private readonly now: () => number;

  constructor(private readonly dependencies: TrackingEngineDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async bootstrap(reason: ReconcileReason): Promise<void> {
    if (isStartupRecoveryReason(reason)) {
      await this.invalidateUnknownDowntime();
    }

    await this.reconcileTrackingState(reason);
  }

  async reconcileTrackingState(reason: ReconcileReason): Promise<void> {
    const run = this.queue.then(() => this.reconcileInternal(reason));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async invalidateUnknownDowntime(): Promise<void> {
    const now = this.now();
    const previous = await this.dependencies.runtimeStateStore.get(now);

    if (previous.status !== "tracking") {
      return;
    }

    await this.dependencies.runtimeStateStore.set({
      status: "inactive",
      activeTabId: null,
      activeWindowId: null,
      domain: null,
      sessionStartedAt: null,
      lastTransitionAt: now,
      revision: previous.revision + 1
    });
    await this.dependencies.runtimeStateStore.setSessionStartReason(null);
  }

  private async getDesiredState(): Promise<DesiredTrackingState> {
    const settings = await this.dependencies.settingsStore.get(this.now());

    if (!settings.trackingEnabled) {
      return {
        status: "disabled",
        context: null
      };
    }

    const context = await this.dependencies.activeContextResolver.resolve(settings);
    return {
      status: deriveDesiredStatus(settings, context),
      context
    };
  }

  private async closePreviousSession(
    previous: PersistedTrackingState,
    now: number,
    reason: ReconcileReason,
    desiredStatus: PersistedTrackingStatus
  ): Promise<void> {
    const endReason = endReasonFromReconcile(reason, desiredStatus);
    const startReason =
      (await this.dependencies.runtimeStateStore.getSessionStartReason()) ?? "startup";

    await this.dependencies.sessionManager.closeSession(previous, now, endReason, startReason);
    await this.dependencies.runtimeStateStore.setSessionStartReason(null);
  }

  private async reconcileInternal(reason: ReconcileReason): Promise<void> {
    const now = this.now();
    const previous = await this.dependencies.runtimeStateStore.get(now);
    const desired = await this.getDesiredState();
    const context = desired.context;
    const activeTabId = context?.activeTabId ?? null;
    const activeWindowId = context?.activeWindowId ?? null;
    const domain = context?.domain ?? null;

    if (
      previous.status === "tracking" &&
      desired.status === "tracking" &&
      previous.domain === domain &&
      domain !== null &&
      previous.sessionStartedAt !== null &&
      previous.sessionStartedAt <= now
    ) {
      await this.dependencies.runtimeStateStore.set(
        makeTrackingState(
          previous,
          now,
          activeTabId,
          activeWindowId,
          domain,
          previous.sessionStartedAt
        )
      );
      return;
    }

    if (previous.status === "tracking") {
      await this.closePreviousSession(previous, now, reason, desired.status);
    }

    if (desired.status === "tracking" && domain) {
      await this.dependencies.runtimeStateStore.set(
        makeTrackingState(previous, now, activeTabId, activeWindowId, domain)
      );
      await this.dependencies.runtimeStateStore.setSessionStartReason(
        startReasonFromReconcile(reason)
      );
      return;
    }

    const inactiveStatus = desired.status === "tracking" ? "inactive" : desired.status;
    await this.dependencies.runtimeStateStore.set(
      makeInactiveState(previous, inactiveStatus, now, activeTabId, activeWindowId, domain)
    );
    await this.dependencies.runtimeStateStore.setSessionStartReason(null);
  }
}
