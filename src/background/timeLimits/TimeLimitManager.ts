import type { TimeLimitRuleManager } from "./TimeLimitRuleManager";
import { buildTimeLimitPageUrl } from "./TimeLimitRuleBuilder";
import type { DailyUsageRepository } from "@/db/repositories/DailyUsageRepository";
import type { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import type { SettingsStore } from "@/storage/SettingsStore";
import { TIME_LIMIT_ALARM_NAME, TIME_LIMIT_BYPASS_DURATION_MS } from "@/shared/constants";
import { normalizeDomain } from "@/shared/domain";
import { getDateKey, splitDurationByLocalDate, startOfNextLocalDay } from "@/shared/time";
import { isTrackableUrl } from "@/shared/url";
import type { ExtensionSettings, TimeLimitStatus, TimeLimitedDomain } from "@/shared/types";

interface TimeLimitManagerDependencies {
  settingsStore: SettingsStore;
  runtimeStateStore: RuntimeStateStore;
  dailyUsageRepository: DailyUsageRepository;
  timeLimitRuleManager: TimeLimitRuleManager;
  now?: () => number;
}

function hasActiveBypass(limited: TimeLimitedDomain, now: number): boolean {
  return limited.bypassUntil !== null && limited.bypassUntil > now;
}

function limitMs(limited: TimeLimitedDomain): number {
  return limited.limitMinutes * 60 * 1000;
}

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
    await this.scheduleNextAlarm(settings, now);
  }

  async handleAlarm(alarmName: string): Promise<void> {
    if (alarmName !== TIME_LIMIT_ALARM_NAME) {
      return;
    }

    await this.refresh();
  }

  async bypass(domainInput: string): Promise<TimeLimitStatus> {
    const now = this.now();
    const domain = normalizeDomain(domainInput);
    const bypassUntil = now + TIME_LIMIT_BYPASS_DURATION_MS;

    await this.dependencies.settingsStore.setTimeLimitBypass(domain, bypassUntil, now);
    await this.refresh();
    return this.getStatus(domain);
  }

  async getStatus(domainInput: string): Promise<TimeLimitStatus> {
    const now = this.now();
    const domain = normalizeDomain(domainInput);
    const settings = await this.dependencies.settingsStore.get(now);
    const limited = settings.timeLimitedDomains.find(
      (candidate) => candidate.enabled && candidate.domain === domain
    );

    if (!limited) {
      throw new Error("This domain does not currently have an active time limit.");
    }

    const usedMs = await this.getTodayUsageMs(domain, now);
    const remainingMs = Math.max(0, limitMs(limited) - usedMs);

    return {
      domain,
      limitMinutes: limited.limitMinutes,
      usedMs,
      remainingMs,
      exceeded: usedMs >= limitMs(limited),
      bypassUntil: hasActiveBypass(limited, now) ? limited.bypassUntil : null
    };
  }

  private async getTodayUsageMs(domain: string, now: number): Promise<number> {
    const today = getDateKey(now);
    const rows = await this.dependencies.dailyUsageRepository.listByDate(today);
    const persistedMs = rows.find((row) => row.domain === domain)?.durationMs ?? 0;
    const runtimeState = await this.dependencies.runtimeStateStore.get(now);

    if (
      runtimeState.status !== "tracking" ||
      runtimeState.domain !== domain ||
      runtimeState.sessionStartedAt === null ||
      runtimeState.sessionStartedAt >= now
    ) {
      return persistedMs;
    }

    const liveMs =
      splitDurationByLocalDate(runtimeState.sessionStartedAt, now).find(
        (slice) => slice.dateKey === today
      )?.durationMs ?? 0;

    return persistedMs + liveMs;
  }

  private async getExceededDomains(settings: ExtensionSettings, now: number): Promise<string[]> {
    const exceeded: string[] = [];

    for (const limited of settings.timeLimitedDomains) {
      if (!limited.enabled || hasActiveBypass(limited, now)) {
        continue;
      }

      const usedMs = await this.getTodayUsageMs(limited.domain, now);

      if (usedMs >= limitMs(limited)) {
        exceeded.push(limited.domain);
      }
    }

    return exceeded;
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

    const limited = settings.timeLimitedDomains.find(
      (candidate) => candidate.enabled && candidate.domain === runtimeState.domain
    );

    if (!limited || hasActiveBypass(limited, now)) {
      return;
    }

    const usedMs = await this.getTodayUsageMs(limited.domain, now);

    if (usedMs < limitMs(limited)) {
      return;
    }

    const tab = await browser.tabs.get(runtimeState.activeTabId);
    const returnUrl =
      tab.url && isTrackableUrl(tab.url) && normalizeDomain(tab.url) === limited.domain
        ? tab.url
        : `https://${limited.domain}/`;

    await browser.tabs.update(runtimeState.activeTabId, {
      url: buildTimeLimitPageUrl(limited.domain, returnUrl)
    });
  }

  private async scheduleNextAlarm(settings: ExtensionSettings, now: number): Promise<void> {
    await browser.alarms.clear(TIME_LIMIT_ALARM_NAME);

    const candidates: number[] = [startOfNextLocalDay(now)];
    const runtimeState = await this.dependencies.runtimeStateStore.get(now);

    for (const limited of settings.timeLimitedDomains) {
      if (!limited.enabled) {
        continue;
      }

      if (hasActiveBypass(limited, now) && limited.bypassUntil !== null) {
        candidates.push(limited.bypassUntil);
      }

      if (runtimeState.status === "tracking" && runtimeState.domain === limited.domain) {
        const usedMs = await this.getTodayUsageMs(limited.domain, now);
        const remainingMs = limitMs(limited) - usedMs;

        if (!hasActiveBypass(limited, now) && remainingMs > 0) {
          candidates.push(now + remainingMs);
        }
      }
    }

    const nextAlarmAt = candidates
      .filter((candidate) => Number.isFinite(candidate) && candidate > now)
      .sort((a, b) => a - b)[0];

    if (nextAlarmAt) {
      browser.alarms.create(TIME_LIMIT_ALARM_NAME, { when: nextAlarmAt });
    }
  }
}
