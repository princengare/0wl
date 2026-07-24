import type { TimeLimitRuleManager } from "./TimeLimitRuleManager";
import { buildTimeLimitPageUrl } from "./TimeLimitRuleBuilder";
import type { DailyUsageRepository } from "@/db/repositories/DailyUsageRepository";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import type { TrackingEngine } from "@/background/tracking/TrackingEngine";
import type { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import type { SettingsStore } from "@/storage/SettingsStore";
import {
  MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS,
  TIME_LIMIT_ALARM_NAME,
  TIME_LIMIT_BYPASS_DURATION_MS
} from "@/shared/constants";
import { browser } from "@/shared/browser";
import { clearAlarm, createAlarm } from "@/platform/alarmsApi";
import { normalizeDomain, normalizeDomainFromUrl } from "@/shared/domain";
import {
  isScopeAllowedBySettings,
  normalizeWindowScope,
  windowScopeFromTab
} from "@/platform/windowScope";
import {
  getScheduleIntervalsBetween,
  isScheduleActive,
  isScheduleAlways,
  nextScheduleTransition,
  overlapDurationMs
} from "@/shared/schedule";
import {
  getDateKey,
  splitDurationByLocalDate,
  startOfLocalDay,
  startOfNextLocalDay
} from "@/shared/time";
import { isTrackableUrl } from "@/shared/url";
import { isAppSurfaceUrl } from "@/shared/appSurface";
import type {
  ExtensionSettings,
  TimeLimitStatus,
  TimeLimitedDomain,
  TimeLimitTargetType,
  WindowScope
} from "@/shared/types";

interface TimeLimitManagerDependencies {
  settingsStore: SettingsStore;
  runtimeStateStore: RuntimeStateStore;
  dailyUsageRepository: DailyUsageRepository;
  sessionRepository: SessionRepository;
  timeLimitRuleManager: TimeLimitRuleManager;
  trackingEngine?: Pick<TrackingEngine, "stopTrackingForTab">;
  now?: () => number;
}

function hasActiveBypass(limited: TimeLimitedDomain, now: number): boolean {
  return limited.bypassUntil !== null && limited.bypassUntil > now;
}

function limitMs(limited: TimeLimitedDomain): number {
  return limited.limitMinutes * 60 * 1000;
}

function timeLimitLabel(limited: TimeLimitedDomain): string {
  if (limited.targetType === "global") {
    return limited.windowScope === "private" ? "All Private Browsing" : "All Browsing";
  }

  return limited.domain ?? "limited site";
}

function resolveStatusTarget(
  domainInput: string | undefined,
  targetTypeInput: TimeLimitTargetType = "domain"
): { targetType: TimeLimitTargetType; domain: string | null } {
  if (targetTypeInput === "global") {
    return { targetType: "global", domain: null };
  }

  if (!domainInput) {
    throw new Error("Choose a valid time-limited domain.");
  }

  return {
    targetType: "domain",
    domain: normalizeDomain(domainInput)
  };
}

function matchesLimitTarget(limited: TimeLimitedDomain, domain: string): boolean {
  return limited.targetType === "global" || limited.domain === domain;
}

function isReasonableLiveSession(sessionStartedAt: number | null, now: number): boolean {
  return (
    sessionStartedAt !== null &&
    sessionStartedAt < now &&
    now - sessionStartedAt < MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS
  );
}

type QueryableTabsApi = typeof browser.tabs & {
  query?: (queryInfo: Record<string, unknown>) => Promise<browser.tabs.Tab[]>;
  update?: typeof browser.tabs.update;
};

export class TimeLimitManager {
  private readonly now: () => number;

  constructor(private readonly dependencies: TimeLimitManagerDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async refresh(): Promise<void> {
    const now = this.now();
    const settings = await this.dependencies.settingsStore.clearExpiredTimeLimitBypasses(now);
    const exceededDomains = await this.getExceededDomains(settings, now);

    await this.dependencies.timeLimitRuleManager.syncDynamicRules(exceededDomains);
    await this.enforceActiveTabIfExceeded(settings, now);
    await this.enforceOpenTabsIfExceeded(settings, {}, now);
    await this.scheduleNextAlarm(settings, now);
  }

  async handleAlarm(alarmName: string): Promise<void> {
    if (alarmName !== TIME_LIMIT_ALARM_NAME) {
      return;
    }

    await this.refresh();
  }

  async bypass(
    domainInput?: string,
    targetTypeInput: TimeLimitTargetType = "domain",
    windowScopeInput: WindowScope = "regular"
  ): Promise<TimeLimitStatus> {
    const now = this.now();
    const target = resolveStatusTarget(domainInput, targetTypeInput);
    const windowScope = normalizeWindowScope(windowScopeInput);
    const bypassUntil = now + TIME_LIMIT_BYPASS_DURATION_MS;

    await this.dependencies.settingsStore.setTimeLimitBypass(
      domainInput,
      bypassUntil,
      now,
      target.targetType,
      windowScope
    );
    await this.refresh();
    return this.getStatus(target.domain ?? undefined, target.targetType, windowScope);
  }

  async getStatus(
    domainInput?: string,
    targetTypeInput: TimeLimitTargetType = "domain",
    windowScopeInput: WindowScope = "regular"
  ): Promise<TimeLimitStatus> {
    const now = this.now();
    const target = resolveStatusTarget(domainInput, targetTypeInput);
    const windowScope = normalizeWindowScope(windowScopeInput);
    const settings = await this.dependencies.settingsStore.get(now);
    const limited = settings.timeLimitedDomains.find(
      (candidate) =>
        candidate.enabled &&
        candidate.targetType === target.targetType &&
        candidate.domain === target.domain &&
        candidate.windowScope === windowScope
    );

    if (!limited) {
      throw new Error("This domain does not currently have an active time limit.");
    }

    const usedMs = await this.getTodayUsageMs(limited, now);
    const remainingMs = Math.max(0, limitMs(limited) - usedMs);

    return {
      domain: limited.domain,
      targetType: limited.targetType,
      windowScope: limited.windowScope,
      label: timeLimitLabel(limited),
      limitMinutes: limited.limitMinutes,
      usedMs,
      remainingMs,
      exceeded: usedMs >= limitMs(limited),
      bypassUntil: hasActiveBypass(limited, now) ? limited.bypassUntil : null
    };
  }

  private async getAlwaysActiveTodayUsageMs(
    limited: TimeLimitedDomain,
    now: number
  ): Promise<number> {
    const today = getDateKey(now);
    const rows = await this.dependencies.dailyUsageRepository.listByDate(
      today,
      limited.windowScope
    );
    const persistedMs =
      limited.targetType === "global"
        ? rows.reduce((sum, row) => sum + row.durationMs, 0)
        : (rows.find((row) => row.domain === limited.domain)?.durationMs ?? 0);
    const runtimeState = await this.dependencies.runtimeStateStore.get(now);
    const liveSessionStartedAt = runtimeState.sessionStartedAt;

    if (
      runtimeState.status !== "tracking" ||
      normalizeWindowScope(runtimeState.windowScope) !== limited.windowScope ||
      (limited.targetType === "domain" && runtimeState.domain !== limited.domain) ||
      !isReasonableLiveSession(liveSessionStartedAt, now) ||
      liveSessionStartedAt === null
    ) {
      return persistedMs;
    }

    const liveMs =
      splitDurationByLocalDate(liveSessionStartedAt, now).find((slice) => slice.dateKey === today)
        ?.durationMs ?? 0;

    return persistedMs + liveMs;
  }

  private async getScheduledTodayUsageMs(limited: TimeLimitedDomain, now: number): Promise<number> {
    const todayStart = startOfLocalDay(now);
    const todayEnd = startOfNextLocalDay(now);
    const searchStart = todayStart - 24 * 60 * 60 * 1000;
    const intervals = getScheduleIntervalsBetween(limited.schedule, todayStart, todayEnd);
    const sessions = await this.dependencies.sessionRepository.getOverlapping(
      searchStart,
      todayEnd,
      limited.windowScope,
      "active"
    );
    const completedMs = sessions
      .filter((session) => limited.targetType === "global" || session.domain === limited.domain)
      .reduce(
        (total, session) =>
          total + overlapDurationMs(session.startedAt, session.endedAt, intervals),
        0
      );
    const runtimeState = await this.dependencies.runtimeStateStore.get(now);
    const liveSessionStartedAt = runtimeState.sessionStartedAt;

    if (
      runtimeState.status !== "tracking" ||
      normalizeWindowScope(runtimeState.windowScope) !== limited.windowScope ||
      (limited.targetType === "domain" && runtimeState.domain !== limited.domain) ||
      !isReasonableLiveSession(liveSessionStartedAt, now) ||
      liveSessionStartedAt === null
    ) {
      return completedMs;
    }

    return completedMs + overlapDurationMs(liveSessionStartedAt, now, intervals);
  }

  private async getTodayUsageMs(limited: TimeLimitedDomain, now: number): Promise<number> {
    if (isScheduleAlways(limited.schedule)) {
      return this.getAlwaysActiveTodayUsageMs(limited, now);
    }

    return this.getScheduledTodayUsageMs(limited, now);
  }

  private async getExceededDomains(settings: ExtensionSettings, now: number): Promise<string[]> {
    const exceededByDomain = new Map<string, Set<WindowScope>>();

    for (const limited of settings.timeLimitedDomains) {
      if (
        !limited.enabled ||
        limited.targetType !== "domain" ||
        !limited.domain ||
        !isScopeAllowedBySettings(settings, limited.windowScope) ||
        hasActiveBypass(limited, now) ||
        !isScheduleActive(limited.schedule, now)
      ) {
        continue;
      }

      const usedMs = await this.getTodayUsageMs(limited, now);

      if (usedMs >= limitMs(limited)) {
        const scopes = exceededByDomain.get(limited.domain) ?? new Set<WindowScope>();
        scopes.add(limited.windowScope);
        exceededByDomain.set(limited.domain, scopes);
      }
    }

    return [...exceededByDomain.entries()]
      .filter(
        ([, scopes]) =>
          settings.privateBrowserTrackingEnabled && scopes.has("regular") && scopes.has("private")
      )
      .map(([domain]) => domain);
  }

  private async findExceededLimitForDomain(
    settings: ExtensionSettings,
    domain: string,
    windowScope: WindowScope,
    now: number,
    targetType?: TimeLimitTargetType
  ): Promise<TimeLimitedDomain | null> {
    if (!isScopeAllowedBySettings(settings, windowScope)) {
      return null;
    }

    const candidates = settings.timeLimitedDomains.filter(
      (candidate) =>
        candidate.enabled &&
        candidate.windowScope === windowScope &&
        (!targetType || candidate.targetType === targetType) &&
        matchesLimitTarget(candidate, domain) &&
        !hasActiveBypass(candidate, now) &&
        isScheduleActive(candidate.schedule, now)
    );

    const sorted = [...candidates].sort((a, b) =>
      a.targetType === b.targetType ? 0 : a.targetType === "domain" ? -1 : 1
    );

    for (const limited of sorted) {
      const usedMs = await this.getTodayUsageMs(limited, now);

      if (usedMs >= limitMs(limited)) {
        return limited;
      }
    }

    return null;
  }

  private async redirectTabForLimit(
    tabId: number,
    tabUrl: string | undefined,
    limited: TimeLimitedDomain
  ): Promise<void> {
    const returnUrl =
      tabUrl && isTrackableUrl(tabUrl)
        ? tabUrl
        : limited.domain
          ? `https://${limited.domain}/`
          : "about:blank";

    await this.dependencies.trackingEngine?.stopTrackingForTab(tabId, "navigation");
    await browser.tabs.update(tabId, {
      url: buildTimeLimitPageUrl(limited, returnUrl)
    });
  }

  private async enforceActiveTabIfExceeded(
    settings: ExtensionSettings,
    now: number
  ): Promise<void> {
    const runtimeState = await this.dependencies.runtimeStateStore.get(now);

    if (
      runtimeState.status !== "tracking" ||
      !runtimeState.domain ||
      runtimeState.activeTabId === null
    ) {
      return;
    }

    const windowScope = normalizeWindowScope(runtimeState.windowScope);
    const limited = await this.findExceededLimitForDomain(
      settings,
      runtimeState.domain,
      windowScope,
      now
    );

    if (!limited) {
      return;
    }

    const tab = await browser.tabs.get(runtimeState.activeTabId);
    const tabDomain = tab.url && isTrackableUrl(tab.url) ? normalizeDomainFromUrl(tab.url) : null;

    if (tabDomain !== runtimeState.domain) {
      return;
    }

    await this.redirectTabForLimit(runtimeState.activeTabId, tab.url, limited);
  }

  async enforceOpenTabsIfExceeded(
    settings: ExtensionSettings,
    change: { domain?: string; targetType?: TimeLimitTargetType; windowScope?: WindowScope } = {},
    now = this.now()
  ): Promise<void> {
    const tabsApi = browser.tabs as QueryableTabsApi;

    if (typeof tabsApi.query !== "function" || typeof tabsApi.update !== "function") {
      return;
    }

    const tabs = await tabsApi.query({});

    await Promise.all(
      tabs.map(async (tab) => {
        if (
          tab.id === undefined ||
          !tab.url ||
          !isTrackableUrl(tab.url) ||
          isAppSurfaceUrl(tab.url)
        ) {
          return;
        }

        const windowScope = windowScopeFromTab(tab);
        const domain = normalizeDomainFromUrl(tab.url);

        if (!domain) {
          return;
        }

        if (change.windowScope && change.windowScope !== windowScope) {
          return;
        }

        if (change.domain && change.domain !== domain) {
          return;
        }

        const limited = await this.findExceededLimitForDomain(
          settings,
          domain,
          windowScope,
          now,
          change.targetType
        );

        if (!limited) {
          return;
        }

        await this.redirectTabForLimit(tab.id, tab.url, limited);
      })
    );
  }

  private async scheduleNextAlarm(settings: ExtensionSettings, now: number): Promise<void> {
    await clearAlarm(TIME_LIMIT_ALARM_NAME);

    const candidates: number[] = [startOfNextLocalDay(now)];
    const runtimeState = await this.dependencies.runtimeStateStore.get(now);

    for (const limited of settings.timeLimitedDomains) {
      if (!limited.enabled) {
        continue;
      }

      if (!isScopeAllowedBySettings(settings, limited.windowScope)) {
        continue;
      }

      if (hasActiveBypass(limited, now) && limited.bypassUntil !== null) {
        candidates.push(limited.bypassUntil);
      }

      const nextTransition = nextScheduleTransition(limited.schedule, now);

      if (nextTransition) {
        candidates.push(nextTransition);
      }

      if (
        runtimeState.status === "tracking" &&
        normalizeWindowScope(runtimeState.windowScope) === limited.windowScope &&
        runtimeState.domain &&
        matchesLimitTarget(limited, runtimeState.domain)
      ) {
        if (!isScheduleActive(limited.schedule, now) || hasActiveBypass(limited, now)) {
          continue;
        }

        const usedMs = await this.getTodayUsageMs(limited, now);
        const remainingMs = limitMs(limited) - usedMs;

        if (remainingMs > 0) {
          candidates.push(now + remainingMs);
        }
      }
    }

    const nextAlarmAt = candidates
      .filter((candidate) => Number.isFinite(candidate) && candidate > now)
      .sort((a, b) => a - b)[0];

    if (nextAlarmAt) {
      createAlarm(TIME_LIMIT_ALARM_NAME, { when: nextAlarmAt });
    }
  }
}
