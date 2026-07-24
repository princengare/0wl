import { buildScheduledBreakPageUrl } from "../timeLimits/TimeLimitRuleBuilder";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import type { TrackingEngine } from "@/background/tracking/TrackingEngine";
import type { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import type { SettingsStore } from "@/storage/SettingsStore";
import { browser } from "@/shared/browser";
import {
  DEFAULT_SCHEDULED_BREAK_DURATION_MINUTES,
  MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS,
  SCHEDULED_BREAK_EARLY_END_AFTER_MS,
  SCHEDULED_BREAK_ALARM_NAME,
  SCHEDULED_BREAK_RUNTIME_STATE_STORAGE_KEY
} from "@/shared/constants";
import { clearAlarm, createAlarm } from "@/platform/alarmsApi";
import {
  isScopeAllowedBySettings,
  normalizeWindowScope,
  windowScopeFromTab
} from "@/platform/windowScope";
import {
  getScheduleIntervalsBetween,
  isScheduleActive,
  nextScheduleTransition,
  overlapDurationMs
} from "@/shared/schedule";
import { startOfNextLocalDay } from "@/shared/time";
import { isAppSurfaceUrl } from "@/shared/appSurface";
import { normalizeDomainFromUrl } from "@/shared/domain";
import { isTrackableUrl } from "@/shared/url";
import { isPlainObject } from "@/shared/validation";
import type {
  ExtensionSettings,
  ScheduledBreakRule,
  ScheduledBreakRuntimeEntry,
  ScheduledBreakRuntimeState,
  ScheduledBreakStatus,
  WindowScope
} from "@/shared/types";

type StorageArea = browser.storage.StorageArea;
type QueryableTabsApi = typeof browser.tabs & {
  query?: (queryInfo: Record<string, unknown>) => Promise<browser.tabs.Tab[]>;
  update?: typeof browser.tabs.update;
};

interface ScheduledBreakManagerDependencies {
  settingsStore: SettingsStore;
  runtimeStateStore: RuntimeStateStore;
  sessionRepository: SessionRepository;
  trackingEngine?: Pick<TrackingEngine, "stopTrackingForTab">;
  storageArea?: StorageArea;
  now?: () => number;
}

function createDefaultRuntime(now: number): ScheduledBreakRuntimeState {
  return {
    schemaVersion: 1,
    rules: [],
    updatedAt: now,
    revision: 0
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeRuntimeEntry(value: unknown, now: number): ScheduledBreakRuntimeEntry | null {
  if (!isPlainObject(value) || typeof value.ruleId !== "string") {
    return null;
  }

  const cycleStartedAt = isFiniteNumber(value.cycleStartedAt) ? value.cycleStartedAt : now;
  const breakActiveUntil =
    value.breakActiveUntil === null || isFiniteNumber(value.breakActiveUntil)
      ? value.breakActiveUntil
      : null;
  const breakStartedAt =
    value.breakStartedAt === null || isFiniteNumber(value.breakStartedAt)
      ? value.breakStartedAt
      : null;
  const dndStartedAt =
    value.dndStartedAt === null || isFiniteNumber(value.dndStartedAt) ? value.dndStartedAt : null;
  const dndEnabled = value.dndEnabled === true;
  const status =
    value.status === "break-active" ||
    value.status === "counting" ||
    value.status === "dnd" ||
    value.status === "inactive"
      ? value.status
      : dndEnabled
        ? "dnd"
        : breakActiveUntil && breakActiveUntil > now
          ? "break-active"
          : "inactive";

  return {
    ruleId: value.ruleId,
    windowScope: normalizeWindowScope(value.windowScope),
    status,
    cycleStartedAt,
    carriedMs: isFiniteNumber(value.carriedMs) && value.carriedMs > 0 ? value.carriedMs : 0,
    breakStartedAt,
    breakActiveUntil,
    dndEnabled,
    dndStartedAt,
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : now
  };
}

function isRuntimeState(value: unknown, now: number): ScheduledBreakRuntimeState | null {
  if (!isPlainObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.rules)) {
    return null;
  }

  return {
    schemaVersion: 1,
    rules: value.rules
      .map((entry) => normalizeRuntimeEntry(entry, now))
      .filter((entry): entry is ScheduledBreakRuntimeEntry => entry !== null),
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : now,
    revision: isFiniteNumber(value.revision) ? value.revision : 0
  };
}

function ruleThresholdMs(rule: ScheduledBreakRule): number {
  return rule.breakAfterMinutes * 60 * 1000;
}

function ruleBreakDurationMs(rule: ScheduledBreakRule): number {
  const minutes =
    Number.isFinite(rule.breakDurationMinutes) && rule.breakDurationMinutes > 0
      ? rule.breakDurationMinutes
      : DEFAULT_SCHEDULED_BREAK_DURATION_MINUTES;

  return minutes * 60 * 1000;
}

function isReasonableLiveSession(sessionStartedAt: number | null, now: number): boolean {
  return (
    sessionStartedAt !== null &&
    sessionStartedAt < now &&
    now - sessionStartedAt < MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS
  );
}

function entryForRule(
  runtime: ScheduledBreakRuntimeState,
  rule: ScheduledBreakRule,
  now: number
): ScheduledBreakRuntimeEntry {
  const existing = runtime.rules.find((entry) => entry.ruleId === rule.id);

  if (existing) {
    return {
      ...existing,
      windowScope: normalizeWindowScope(rule.windowScope)
    };
  }

  return {
    ruleId: rule.id,
    windowScope: normalizeWindowScope(rule.windowScope),
    status: "inactive",
    cycleStartedAt: Math.min(rule.createdAt, now),
    carriedMs: 0,
    breakStartedAt: null,
    breakActiveUntil: null,
    dndEnabled: false,
    dndStartedAt: null,
    updatedAt: now
  };
}

function statusLabel(rule: ScheduledBreakRule): string {
  const scope = normalizeWindowScope(rule.windowScope) === "private" ? "Private" : "Regular";
  return `${scope} break after ${rule.breakAfterMinutes} min`;
}

export class ScheduledBreakManager {
  private readonly storageArea: StorageArea;
  private readonly now: () => number;

  constructor(private readonly dependencies: ScheduledBreakManagerDependencies) {
    this.storageArea = dependencies.storageArea ?? browser.storage.local;
    this.now = dependencies.now ?? Date.now;
  }

  async refresh(): Promise<void> {
    const now = this.now();
    const settings = await this.dependencies.settingsStore.get(now);
    const runtime = await this.getRuntime(now);
    const nextEntries: ScheduledBreakRuntimeEntry[] = [];
    const alarmCandidates: number[] = [startOfNextLocalDay(now)];

    for (const rule of settings.scheduledBreakRules) {
      const entry = await this.refreshRule(settings, rule, entryForRule(runtime, rule, now), now);
      nextEntries.push(entry);

      const nextTransition = nextScheduleTransition(rule.schedule, now);
      if (nextTransition) {
        alarmCandidates.push(nextTransition);
      }

      if (entry.dndEnabled) {
        continue;
      }

      if (entry.breakActiveUntil && entry.breakActiveUntil > now) {
        alarmCandidates.push(entry.breakActiveUntil);
        continue;
      }

      if (
        rule.enabled &&
        isScopeAllowedBySettings(settings, rule.windowScope) &&
        isScheduleActive(rule.schedule, now)
      ) {
        const usedMs = await this.getUsageTowardRule(rule, entry, now);
        const remainingMs = ruleThresholdMs(rule) - usedMs;

        if (remainingMs > 0) {
          alarmCandidates.push(now + remainingMs);
        }
      }
    }

    await this.setRuntime({
      schemaVersion: 1,
      rules: nextEntries,
      updatedAt: now,
      revision: runtime.revision + 1
    });
    await this.enforceOpenTabsIfBreakActive(settings);
    await this.scheduleNextAlarm(alarmCandidates, now);
  }

  async handleAlarm(alarmName: string): Promise<void> {
    if (alarmName !== SCHEDULED_BREAK_ALARM_NAME) {
      return;
    }

    await this.refresh();
  }

  async setDnd(
    enabled: boolean,
    windowScopeInput: WindowScope = "regular"
  ): Promise<ScheduledBreakStatus> {
    const now = this.now();
    const windowScope = normalizeWindowScope(windowScopeInput);
    const settings = await this.dependencies.settingsStore.get(now);
    const runtime = await this.getRuntime(now);
    const nextEntries = [...runtime.rules];

    for (const rule of settings.scheduledBreakRules.filter(
      (candidate) => candidate.windowScope === windowScope
    )) {
      const existingIndex = nextEntries.findIndex((entry) => entry.ruleId === rule.id);
      const entry = entryForRule(runtime, rule, now);
      let nextEntry: ScheduledBreakRuntimeEntry;

      if (enabled) {
        const carriedMs = await this.getUsageTowardRule(rule, entry, now);
        nextEntry = {
          ...entry,
          status: "dnd",
          carriedMs: Math.min(carriedMs, Math.max(0, ruleThresholdMs(rule) - 1)),
          dndEnabled: true,
          dndStartedAt: now,
          breakStartedAt: null,
          breakActiveUntil: null,
          updatedAt: now
        };
      } else {
        nextEntry = {
          ...entry,
          status: "counting",
          cycleStartedAt: now,
          carriedMs: 0,
          dndEnabled: false,
          dndStartedAt: null,
          breakStartedAt: null,
          breakActiveUntil: null,
          updatedAt: now
        };
      }

      if (existingIndex >= 0) {
        nextEntries[existingIndex] = nextEntry;
      } else {
        nextEntries.push(nextEntry);
      }
    }

    await this.setRuntime({
      schemaVersion: 1,
      rules: nextEntries,
      updatedAt: now,
      revision: runtime.revision + 1
    });
    await this.refresh();
    return this.getStatus(windowScope);
  }

  async getStatus(windowScopeInput: WindowScope = "regular"): Promise<ScheduledBreakStatus> {
    const now = this.now();
    const windowScope = normalizeWindowScope(windowScopeInput);
    const settings = await this.dependencies.settingsStore.get(now);
    const runtime = await this.getRuntime(now);
    const rules = settings.scheduledBreakRules.filter(
      (rule) => rule.enabled && normalizeWindowScope(rule.windowScope) === windowScope
    );
    const activeRules = rules.filter((rule) => isScheduleActive(rule.schedule, now));
    const activeEntries = rules.map((rule) => ({
      rule,
      entry: entryForRule(runtime, rule, now)
    }));
    const breakEntry = activeEntries.find(
      ({ entry }) => entry.breakActiveUntil !== null && entry.breakActiveUntil > now
    );
    const dndEnabled = activeEntries.some(({ entry }) => entry.dndEnabled);
    const visible = activeRules.length > 0 || Boolean(breakEntry) || dndEnabled;
    const countingRule = activeRules[0] ?? breakEntry?.rule ?? null;
    const nextBreakAfterMs =
      countingRule && !dndEnabled && !breakEntry
        ? Math.max(
            0,
            ruleThresholdMs(countingRule) -
              (await this.getUsageTowardRule(
                countingRule,
                entryForRule(runtime, countingRule, now),
                now
              ))
          )
        : null;

    return {
      visible,
      dndEnabled,
      breakActive: Boolean(breakEntry),
      breakActiveUntil: breakEntry?.entry.breakActiveUntil ?? null,
      ruleCount: rules.length,
      activeRuleLabel: countingRule ? statusLabel(countingRule) : null,
      remainingBreakMs: breakEntry?.entry.breakActiveUntil
        ? Math.max(0, breakEntry.entry.breakActiveUntil - now)
        : 0,
      nextBreakAfterMs,
      breakStartedAt: breakEntry ? this.breakStartedAtFor(breakEntry.rule, breakEntry.entry) : null,
      canEndBreak: breakEntry ? this.canEndBreak(breakEntry.rule, breakEntry.entry, now) : false,
      canEndBreakAt: breakEntry ? this.canEndBreakAt(breakEntry.rule, breakEntry.entry) : null
    };
  }

  async endActiveBreak(windowScopeInput: WindowScope = "regular"): Promise<ScheduledBreakStatus> {
    const now = this.now();
    const windowScope = normalizeWindowScope(windowScopeInput);
    const settings = await this.dependencies.settingsStore.get(now);
    const runtime = await this.getRuntime(now);
    let changed = false;

    const nextEntries = runtime.rules.map((entry): ScheduledBreakRuntimeEntry => {
      const rule = settings.scheduledBreakRules.find((candidate) => candidate.id === entry.ruleId);

      if (!rule || normalizeWindowScope(rule.windowScope) !== windowScope) {
        return entry;
      }

      if (!entry.breakActiveUntil || entry.breakActiveUntil <= now) {
        const nextStatus = isScheduleActive(rule.schedule, now) ? "counting" : "inactive";
        changed ||= entry.status === "break-active" || entry.breakStartedAt !== null;
        return {
          ...entry,
          status: nextStatus,
          cycleStartedAt: now,
          carriedMs: 0,
          breakStartedAt: null,
          breakActiveUntil: null,
          updatedAt: now
        };
      }

      if (!this.canEndBreak(rule, entry, now)) {
        throw new Error("Breaks can be ended after the first 5 minutes.");
      }

      const nextStatus = isScheduleActive(rule.schedule, now) ? "counting" : "inactive";
      changed = true;
      return {
        ...entry,
        status: nextStatus,
        cycleStartedAt: now,
        carriedMs: 0,
        breakStartedAt: null,
        breakActiveUntil: null,
        updatedAt: now
      };
    });

    if (changed) {
      await this.setRuntime({
        schemaVersion: 1,
        rules: nextEntries,
        updatedAt: now,
        revision: runtime.revision + 1
      });
      await this.refresh();
    }

    return this.getStatus(windowScope);
  }

  async enforceOpenTabsIfBreakActive(
    settings: ExtensionSettings,
    change: { windowScope?: WindowScope } = {}
  ): Promise<void> {
    const now = this.now();
    const runtime = await this.getRuntime(now);
    const activeBreakScopes = new Map<WindowScope, number>();

    for (const rule of settings.scheduledBreakRules) {
      const entry = entryForRule(runtime, rule, now);

      if (
        rule.enabled &&
        isScopeAllowedBySettings(settings, rule.windowScope) &&
        !entry.dndEnabled &&
        entry.breakActiveUntil !== null &&
        entry.breakActiveUntil > now
      ) {
        activeBreakScopes.set(normalizeWindowScope(rule.windowScope), entry.breakActiveUntil);
      }
    }

    if (activeBreakScopes.size === 0) {
      return;
    }

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

        if (change.windowScope && normalizeWindowScope(change.windowScope) !== windowScope) {
          return;
        }

        const breakUntil = activeBreakScopes.get(windowScope);

        if (!breakUntil || !normalizeDomainFromUrl(tab.url)) {
          return;
        }

        await this.dependencies.trackingEngine?.stopTrackingForTab(tab.id, "navigation");
        await browser.tabs.update(tab.id, {
          url: buildScheduledBreakPageUrl(windowScope, breakUntil, tab.url)
        });
      })
    );
  }

  private async refreshRule(
    settings: ExtensionSettings,
    rule: ScheduledBreakRule,
    entry: ScheduledBreakRuntimeEntry,
    now: number
  ): Promise<ScheduledBreakRuntimeEntry> {
    if (!rule.enabled || !isScopeAllowedBySettings(settings, rule.windowScope)) {
      return {
        ...entry,
        status: "inactive",
        breakStartedAt: null,
        breakActiveUntil: null,
        updatedAt: now
      };
    }

    if (entry.dndEnabled) {
      return {
        ...entry,
        status: "dnd",
        breakStartedAt: null,
        breakActiveUntil: null,
        updatedAt: now
      };
    }

    if (entry.breakActiveUntil && entry.breakActiveUntil > now) {
      await this.enforceOpenTabsIfBreakActive(settings, { windowScope: rule.windowScope });
      return {
        ...entry,
        status: "break-active",
        breakStartedAt: entry.breakStartedAt ?? this.breakStartedAtFor(rule, entry),
        updatedAt: now
      };
    }

    if (entry.breakActiveUntil && entry.breakActiveUntil <= now) {
      return {
        ...entry,
        status: isScheduleActive(rule.schedule, now) ? "counting" : "inactive",
        cycleStartedAt: now,
        carriedMs: 0,
        breakStartedAt: null,
        breakActiveUntil: null,
        updatedAt: now
      };
    }

    if (!isScheduleActive(rule.schedule, now)) {
      return {
        ...entry,
        status: "inactive",
        breakStartedAt: null,
        breakActiveUntil: null,
        updatedAt: now
      };
    }

    const usedMs = await this.getUsageTowardRule(rule, entry, now);

    if (usedMs >= ruleThresholdMs(rule)) {
      return {
        ...entry,
        status: "break-active",
        breakStartedAt: now,
        breakActiveUntil: now + ruleBreakDurationMs(rule),
        carriedMs: 0,
        updatedAt: now
      };
    }

    return {
      ...entry,
      status: "counting",
      breakStartedAt: null,
      breakActiveUntil: null,
      updatedAt: now
    };
  }

  private async getUsageTowardRule(
    rule: ScheduledBreakRule,
    entry: ScheduledBreakRuntimeEntry,
    now: number
  ): Promise<number> {
    const cycleStartedAt = Math.min(entry.cycleStartedAt, now);
    const intervals = getScheduleIntervalsBetween(rule.schedule, cycleStartedAt, now);
    const sessions = await this.dependencies.sessionRepository.getOverlapping(
      cycleStartedAt,
      now,
      normalizeWindowScope(rule.windowScope),
      "active"
    );
    const completedMs = sessions.reduce(
      (sum, session) => sum + overlapDurationMs(session.startedAt, session.endedAt, intervals),
      0
    );
    const runtimeState = await this.dependencies.runtimeStateStore.get(now);
    const liveSessionStartedAt = runtimeState.sessionStartedAt;
    const liveMs =
      runtimeState.status === "tracking" &&
      normalizeWindowScope(runtimeState.windowScope) === normalizeWindowScope(rule.windowScope) &&
      isReasonableLiveSession(liveSessionStartedAt, now) &&
      liveSessionStartedAt !== null
        ? overlapDurationMs(Math.max(liveSessionStartedAt, cycleStartedAt), now, intervals)
        : 0;

    return entry.carriedMs + completedMs + liveMs;
  }

  private async scheduleNextAlarm(candidates: number[], now: number): Promise<void> {
    await clearAlarm(SCHEDULED_BREAK_ALARM_NAME);
    const nextAlarmAt = candidates
      .filter((candidate) => Number.isFinite(candidate) && candidate > now)
      .sort((a, b) => a - b)[0];

    if (nextAlarmAt) {
      createAlarm(SCHEDULED_BREAK_ALARM_NAME, { when: nextAlarmAt });
    }
  }

  private async getRuntime(now = this.now()): Promise<ScheduledBreakRuntimeState> {
    const result = (await this.storageArea.get(
      SCHEDULED_BREAK_RUNTIME_STATE_STORAGE_KEY
    )) as Record<string, unknown>;
    const runtime = isRuntimeState(result[SCHEDULED_BREAK_RUNTIME_STATE_STORAGE_KEY], now);
    return runtime ?? createDefaultRuntime(now);
  }

  private async setRuntime(runtime: ScheduledBreakRuntimeState): Promise<void> {
    await this.storageArea.set({ [SCHEDULED_BREAK_RUNTIME_STATE_STORAGE_KEY]: runtime });
  }

  private breakStartedAtFor(
    rule: ScheduledBreakRule,
    entry: ScheduledBreakRuntimeEntry
  ): number | null {
    if (!entry.breakActiveUntil) {
      return null;
    }

    return entry.breakStartedAt ?? entry.breakActiveUntil - ruleBreakDurationMs(rule);
  }

  private canEndBreakAt(
    rule: ScheduledBreakRule,
    entry: ScheduledBreakRuntimeEntry
  ): number | null {
    const startedAt = this.breakStartedAtFor(rule, entry);

    if (startedAt === null || ruleBreakDurationMs(rule) <= SCHEDULED_BREAK_EARLY_END_AFTER_MS) {
      return null;
    }

    return startedAt + SCHEDULED_BREAK_EARLY_END_AFTER_MS;
  }

  private canEndBreak(
    rule: ScheduledBreakRule,
    entry: ScheduledBreakRuntimeEntry,
    now: number
  ): boolean {
    const canEndAt = this.canEndBreakAt(rule, entry);
    return Boolean(
      entry.breakActiveUntil && entry.breakActiveUntil > now && canEndAt && now >= canEndAt
    );
  }
}
