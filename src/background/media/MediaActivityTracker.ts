import { openDatabase } from "@/db/database";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import type { ActiveContextResolver } from "@/background/tracking/ActiveContextResolver";
import type { SettingsStore } from "@/storage/SettingsStore";
import { MEDIA_REPORT_STALE_MS, MEDIA_RUNTIME_STATE_STORAGE_KEY } from "@/shared/constants";
import { browser } from "@/shared/browser";
import { normalizeDomainFromUrl } from "@/shared/domain";
import { isTrackableUrl } from "@/shared/url";
import { isAppSurfaceUrl } from "@/shared/appSurface";
import { getDateKey } from "@/shared/time";
import {
  isScopeAllowedBySettings,
  normalizeWindowScope,
  windowScopeFromTab
} from "@/platform/windowScope";
import type {
  ExtensionSettings,
  MediaUsageMode,
  UsageMode,
  PersistedMediaSessionState,
  PersistedMediaTabReport,
  PersistedMediaTrackingState,
  UsageSession,
  WindowScope
} from "@/shared/types";

type MediaStateMessage = {
  type: "REPORT_MEDIA_STATE";
  url: string;
  playing: boolean;
  playingAudio?: boolean;
  playingVideo?: boolean;
  pictureInPicture: boolean;
  pictureInPictureSupported?: boolean;
  reportedAt?: number;
};

type StorageArea = browser.storage.StorageArea;

interface MediaActivityTrackerDependencies {
  settingsStore: SettingsStore;
  sessionRepository: SessionRepository;
  activeContextResolver: ActiveContextResolver;
  storageArea?: StorageArea;
  now?: () => number;
}

interface DesiredMediaSession {
  key: string;
  tabId: number;
  windowId: number | null;
  domain: string;
  windowScope: WindowScope;
  usageMode: MediaUsageMode;
}

type MediaReconcileReason =
  | "startup"
  | "background-wakeup"
  | "media-report"
  | "tab-activated"
  | "navigation"
  | "tab-closed"
  | "window-focused"
  | "window-blurred"
  | "idle"
  | "idle-resumed"
  | "settings-changed"
  | "tracking-disabled"
  | "installed"
  | "manual";

const STATE_VERSION = 1;

function mediaSessionKey(
  tabId: number,
  windowScope: WindowScope,
  usageMode: MediaUsageMode,
  domain: string
): string {
  return `${tabId}::${windowScope}::${usageMode}::${domain}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMediaUsageMode(value: unknown): MediaUsageMode | null {
  return value === "pip" || value === "background" ? value : null;
}

function createMediaSessionId(
  domain: string,
  usageMode: MediaUsageMode,
  startedAt: number,
  endedAt: number,
  tabId: number
): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${usageMode}-${domain}-${tabId}-${startedAt}-${endedAt}`;
}

function normalizeReport(value: unknown): PersistedMediaTabReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PersistedMediaTabReport>;

  if (
    !isFiniteNumber(candidate.tabId) ||
    !(candidate.windowId === null || isFiniteNumber(candidate.windowId)) ||
    typeof candidate.url !== "string" ||
    typeof candidate.domain !== "string" ||
    typeof candidate.playing !== "boolean" ||
    typeof candidate.pictureInPicture !== "boolean" ||
    !isFiniteNumber(candidate.reportedAt)
  ) {
    return null;
  }

  const windowScope = normalizeWindowScope(candidate.windowScope);

  return {
    tabId: candidate.tabId,
    windowId: candidate.windowId,
    url: candidate.url,
    domain: candidate.domain,
    windowScope,
    playing: candidate.playing,
    playingAudio: typeof candidate.playingAudio === "boolean" ? candidate.playingAudio : false,
    playingVideo:
      typeof candidate.playingVideo === "boolean"
        ? candidate.playingVideo
        : candidate.playing || candidate.pictureInPicture,
    pictureInPicture: candidate.pictureInPicture,
    pictureInPictureSupported:
      typeof candidate.pictureInPictureSupported === "boolean"
        ? candidate.pictureInPictureSupported
        : false,
    reportedAt: candidate.reportedAt
  };
}

function normalizeSession(value: unknown): PersistedMediaSessionState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PersistedMediaSessionState>;
  const usageMode = normalizeMediaUsageMode(candidate.usageMode);

  if (
    typeof candidate.key !== "string" ||
    !isFiniteNumber(candidate.tabId) ||
    !(candidate.windowId === null || isFiniteNumber(candidate.windowId)) ||
    typeof candidate.domain !== "string" ||
    !usageMode ||
    !isFiniteNumber(candidate.startedAt) ||
    !isFiniteNumber(candidate.lastObservedAt)
  ) {
    return null;
  }

  const windowScope = normalizeWindowScope(candidate.windowScope);

  return {
    key: candidate.key,
    tabId: candidate.tabId,
    windowId: candidate.windowId,
    domain: candidate.domain,
    windowScope,
    usageMode,
    startedAt: candidate.startedAt,
    lastObservedAt: Math.max(candidate.startedAt, candidate.lastObservedAt)
  };
}

function createDefaultState(now: number): PersistedMediaTrackingState {
  return {
    schemaVersion: STATE_VERSION,
    reports: [],
    sessions: [],
    updatedAt: now,
    revision: 0
  };
}

function normalizeState(value: unknown, now: number): PersistedMediaTrackingState {
  if (!value || typeof value !== "object") {
    return createDefaultState(now);
  }

  const candidate = value as Partial<PersistedMediaTrackingState>;

  if (candidate.schemaVersion !== STATE_VERSION) {
    return createDefaultState(now);
  }

  return {
    schemaVersion: STATE_VERSION,
    reports: Array.isArray(candidate.reports)
      ? candidate.reports.flatMap((report) => {
          const normalized = normalizeReport(report);
          return normalized ? [normalized] : [];
        })
      : [],
    sessions: Array.isArray(candidate.sessions)
      ? candidate.sessions.flatMap((session) => {
          const normalized = normalizeSession(session);
          return normalized ? [normalized] : [];
        })
      : [],
    updatedAt: isFiniteNumber(candidate.updatedAt) ? candidate.updatedAt : now,
    revision: isFiniteNumber(candidate.revision) ? candidate.revision : 0
  };
}

function canUseTab(tab: browser.tabs.Tab): tab is browser.tabs.Tab & { id: number; url: string } {
  return tab.id !== undefined && typeof tab.url === "string" && isTrackableUrl(tab.url);
}

export class MediaActivityTracker {
  private queue: Promise<void> = Promise.resolve();
  private readonly storageArea: StorageArea;
  private readonly now: () => number;

  constructor(private readonly dependencies: MediaActivityTrackerDependencies) {
    this.storageArea = dependencies.storageArea ?? browser.storage.local;
    this.now = dependencies.now ?? Date.now;
  }

  async recoverConservatively(
    reason: Extract<MediaReconcileReason, "startup" | "background-wakeup">
  ): Promise<void> {
    return this.runExclusive(async () => {
      const now = this.now();
      const state = await this.getState(now);

      const freshSessions =
        reason === "startup"
          ? []
          : state.sessions.filter(
              (session) => now - session.lastObservedAt <= MEDIA_REPORT_STALE_MS
            );
      const staleSessions =
        reason === "startup"
          ? state.sessions
          : state.sessions.filter(
              (session) => now - session.lastObservedAt > MEDIA_REPORT_STALE_MS
            );

      await this.closeSessions(staleSessions, "media-stale", (session) => session.lastObservedAt);
      await this.setState({
        schemaVersion: STATE_VERSION,
        reports:
          reason === "startup"
            ? []
            : state.reports.filter((report) => now - report.reportedAt <= MEDIA_REPORT_STALE_MS),
        sessions: freshSessions,
        updatedAt: now,
        revision: state.revision + 1
      });
    });
  }

  async handleMediaStateReport(
    message: MediaStateMessage,
    sender?: browser.runtime.MessageSender
  ): Promise<void> {
    return this.runExclusive(async () => {
      const now = this.now();
      const tab = sender?.tab;

      if (!tab || tab.id === undefined) {
        return;
      }

      const url = tab.url && isTrackableUrl(tab.url) ? tab.url : message.url;

      if (!isTrackableUrl(url) || isAppSurfaceUrl(url)) {
        await this.closeTabSessions(tab.id, now, "navigation");
        return;
      }

      const domain = normalizeDomainFromUrl(url);

      if (!domain) {
        await this.closeTabSessions(tab.id, now, "navigation");
        return;
      }

      const settings = await this.dependencies.settingsStore.get(now);
      const windowScope = windowScopeFromTab(tab);

      if (!isScopeAllowedBySettings(settings, windowScope)) {
        await this.closeTabSessions(tab.id, now, "settings-changed");
        return;
      }

      const state = await this.getState(now);
      const reports = state.reports.filter((report) => report.tabId !== tab.id);
      const playingAudio = Boolean(message.playingAudio);
      const playingVideo = Boolean(message.playingVideo);
      const playing = Boolean(message.playing || playingAudio || playingVideo);
      const pictureInPicture = Boolean(message.pictureInPicture);
      const pictureInPictureSupported = Boolean(message.pictureInPictureSupported);
      const reportedAt = isFiniteNumber(message.reportedAt)
        ? Math.min(message.reportedAt, now)
        : now;

      if (playing || pictureInPicture) {
        reports.push({
          tabId: tab.id,
          windowId: typeof tab.windowId === "number" ? tab.windowId : null,
          url,
          domain,
          windowScope,
          playing,
          playingAudio,
          playingVideo,
          pictureInPicture,
          pictureInPictureSupported,
          reportedAt
        });
      }

      await this.setState({
        ...state,
        reports,
        updatedAt: now,
        revision: state.revision + 1
      });

      if (!playing && !pictureInPicture) {
        await this.closeTabSessions(tab.id, now, "media-stopped");
        return;
      }

      await this.reconcileInternal("media-report");
    });
  }

  async reconcile(reason: MediaReconcileReason): Promise<void> {
    return this.runExclusive(() => this.reconcileInternal(reason));
  }

  async getLiveSessions(
    start: number,
    end: number,
    windowScopeInput: WindowScope,
    usageModeInput: UsageMode
  ): Promise<UsageSession[]> {
    if (usageModeInput !== "pip" && usageModeInput !== "background") {
      return [];
    }

    const now = this.now();
    const state = await this.getState(now);
    const windowScope = normalizeWindowScope(windowScopeInput);

    return state.sessions.flatMap((session) => {
      if (
        session.windowScope !== windowScope ||
        session.usageMode !== usageModeInput ||
        session.startedAt >= end ||
        now <= start
      ) {
        return [];
      }

      const startedAt = Math.max(session.startedAt, start);
      const endedAt = Math.min(now, end);

      if (endedAt <= startedAt) {
        return [];
      }

      return [
        {
          id: `runtime-${session.key}`,
          domain: session.domain,
          windowScope,
          usageMode: session.usageMode,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          startReason: "media-started",
          endReason: "media-stopped",
          dateKey: getDateKey(startedAt),
          createdAt: endedAt
        }
      ];
    });
  }

  async handleTabRemoved(tabId: number): Promise<void> {
    return this.runExclusive(async () => {
      await this.closeTabSessions(tabId, this.now(), "tab-closed");
    });
  }

  async handleNavigation(tabId: number): Promise<void> {
    return this.runExclusive(async () => {
      await this.closeTabSessions(tabId, this.now(), "navigation");
    });
  }

  private async runExclusive(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async getState(now: number): Promise<PersistedMediaTrackingState> {
    const result = (await this.storageArea.get(MEDIA_RUNTIME_STATE_STORAGE_KEY)) as Record<
      string,
      unknown
    >;
    return normalizeState(result[MEDIA_RUNTIME_STATE_STORAGE_KEY], now);
  }

  private async setState(state: PersistedMediaTrackingState): Promise<void> {
    await this.storageArea.set({ [MEDIA_RUNTIME_STATE_STORAGE_KEY]: state });
  }

  private async queryTabs(): Promise<browser.tabs.Tab[]> {
    try {
      return await browser.tabs.query({});
    } catch {
      return [];
    }
  }

  private async reconcileInternal(reason: MediaReconcileReason): Promise<void> {
    const now = this.now();
    const state = await this.getState(now);
    const settings = await this.dependencies.settingsStore.get(now);
    const [context, tabs] = await Promise.all([
      this.dependencies.activeContextResolver.resolve(settings),
      this.queryTabs()
    ]);
    const tabsById = new Map<number, browser.tabs.Tab>();

    for (const tab of tabs) {
      if (tab.id !== undefined) {
        tabsById.set(tab.id, tab);
      }
    }

    const desired = new Map<string, DesiredMediaSession>();
    const freshReports: PersistedMediaTabReport[] = [];
    const activeTabId =
      context.idleState === "active" && context.browserFocused ? context.activeTabId : null;
    const canTrackMedia = settings.trackingEnabled && context.idleState === "active";

    for (const report of state.reports) {
      const tab = tabsById.get(report.tabId);

      if (!tab || !canUseTab(tab)) {
        continue;
      }

      if (isAppSurfaceUrl(tab.url)) {
        continue;
      }

      const domain = normalizeDomainFromUrl(tab.url);

      if (!domain) {
        continue;
      }

      const windowScope = windowScopeFromTab(tab);
      const playing = report.playing;
      const pictureInPicture = report.pictureInPicture;
      const isFresh =
        now - report.reportedAt <= MEDIA_REPORT_STALE_MS ||
        (report.playing && Boolean(tab.audible));

      if (!isFresh) {
        continue;
      }

      if (playing || pictureInPicture) {
        const normalizedReport: PersistedMediaTabReport = {
          ...report,
          url: tab.url,
          domain,
          windowId: typeof tab.windowId === "number" ? tab.windowId : null,
          windowScope,
          playing,
          playingAudio: report.playingAudio,
          playingVideo: report.playingVideo,
          pictureInPicture,
          pictureInPictureSupported: report.pictureInPictureSupported
        };
        freshReports.push(normalizedReport);
        this.addDesiredSession(desired, normalizedReport, activeTabId, canTrackMedia, settings);
      }
    }

    const nextSessions: PersistedMediaSessionState[] = [];

    for (const session of state.sessions) {
      const next = desired.get(session.key);

      if (!next) {
        const closeAt =
          reason === "startup" || reason === "background-wakeup"
            ? session.lastObservedAt
            : this.closeTimeForMissingSession(session, freshReports, now);
        await this.closeSession(session, closeAt, "media-stopped");
        continue;
      }

      nextSessions.push({
        ...session,
        windowId: next.windowId,
        domain: next.domain,
        windowScope: next.windowScope,
        usageMode: next.usageMode,
        lastObservedAt: now
      });
      desired.delete(session.key);
    }

    for (const session of desired.values()) {
      nextSessions.push({
        ...session,
        startedAt: now,
        lastObservedAt: now
      });
    }

    await this.setState({
      schemaVersion: STATE_VERSION,
      reports: freshReports,
      sessions: nextSessions,
      updatedAt: now,
      revision: state.revision + 1
    });
  }

  private addDesiredSession(
    desired: Map<string, DesiredMediaSession>,
    report: PersistedMediaTabReport,
    activeTabId: number | null,
    canTrackMedia: boolean,
    settings: ExtensionSettings
  ): void {
    if (
      !canTrackMedia ||
      settings.ignoredDomains.includes(report.domain) ||
      !isScopeAllowedBySettings(settings, report.windowScope)
    ) {
      return;
    }

    const usageMode: MediaUsageMode | null = report.pictureInPicture
      ? "pip"
      : report.playing && report.tabId !== activeTabId
        ? "background"
        : null;

    if (!usageMode) {
      return;
    }

    const key = mediaSessionKey(report.tabId, report.windowScope, usageMode, report.domain);
    desired.set(key, {
      key,
      tabId: report.tabId,
      windowId: report.windowId,
      domain: report.domain,
      windowScope: report.windowScope,
      usageMode
    });
  }

  private closeTimeForMissingSession(
    session: PersistedMediaSessionState,
    freshReports: PersistedMediaTabReport[],
    now: number
  ): number {
    const tabStillReporting = freshReports.some((report) => report.tabId === session.tabId);
    return tabStillReporting ? now : session.lastObservedAt;
  }

  private async closeTabSessions(
    tabId: number,
    endedAt: number,
    reason: "navigation" | "tab-closed" | "settings-changed" | "media-stopped"
  ): Promise<void> {
    const state = await this.getState(endedAt);
    const remainingSessions: PersistedMediaSessionState[] = [];

    for (const session of state.sessions) {
      if (session.tabId === tabId) {
        await this.closeSession(
          session,
          endedAt,
          reason === "tab-closed"
            ? "tab-closed"
            : reason === "navigation"
              ? "navigation"
              : reason === "media-stopped"
                ? "media-stopped"
                : "tracking-disabled"
        );
      } else {
        remainingSessions.push(session);
      }
    }

    await this.setState({
      ...state,
      reports: state.reports.filter((report) => report.tabId !== tabId),
      sessions: remainingSessions,
      updatedAt: endedAt,
      revision: state.revision + 1
    });
  }

  private async closeSessions(
    sessions: PersistedMediaSessionState[],
    endReason: UsageSession["endReason"],
    resolveEndedAt: (session: PersistedMediaSessionState) => number
  ): Promise<void> {
    for (const session of sessions) {
      await this.closeSession(session, resolveEndedAt(session), endReason);
    }
  }

  private async closeSession(
    state: PersistedMediaSessionState,
    endedAtInput: number,
    endReason: UsageSession["endReason"]
  ): Promise<void> {
    const endedAt = Math.max(state.startedAt, Math.min(endedAtInput, this.now()));
    const durationMs = endedAt - state.startedAt;

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return;
    }

    await openDatabase();

    const session: UsageSession = {
      id: createMediaSessionId(
        state.domain,
        state.usageMode,
        state.startedAt,
        endedAt,
        state.tabId
      ),
      domain: state.domain,
      windowScope: normalizeWindowScope(state.windowScope),
      usageMode: state.usageMode,
      startedAt: state.startedAt,
      endedAt,
      durationMs,
      startReason: "media-started",
      endReason,
      dateKey: getDateKey(state.startedAt),
      createdAt: endedAt
    };

    await this.dependencies.sessionRepository.add(session);
  }
}
