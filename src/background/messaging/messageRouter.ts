import type { BlockRuleManager } from "../blocking/BlockRuleManager";
import type { BlockAttemptRecorder } from "../blocking/BlockAttemptRecorder";
import type { TimeLimitManager } from "../timeLimits/TimeLimitManager";
import type { TrackingEngine } from "../tracking/TrackingEngine";
import type { BlockAttemptRepository } from "@/db/repositories/BlockAttemptRepository";
import type { DailyUsageRepository } from "@/db/repositories/DailyUsageRepository";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import type { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import type { SettingsStore } from "@/storage/SettingsStore";
import {
  addLiveDurationToDailyRows,
  getDateKey,
  startOfLocalDay,
  startOfNextLocalDay
} from "@/shared/time";
import { isPlainObject, isString } from "@/shared/validation";
import type {
  ExtensionSettings,
  HistoryRange,
  HistorySessionView,
  MessageRequest,
  MessageResponse,
  TodaySummary
} from "@/shared/types";

interface MessageRouterDependencies {
  settingsStore: SettingsStore;
  runtimeStateStore: RuntimeStateStore;
  dailyUsageRepository: DailyUsageRepository;
  sessionRepository: SessionRepository;
  blockAttemptRepository: BlockAttemptRepository;
  blockAttemptRecorder: BlockAttemptRecorder;
  blockRuleManager: BlockRuleManager;
  timeLimitManager: TimeLimitManager;
  trackingEngine: TrackingEngine;
  now?: () => number;
}

function ok<T>(data: T): MessageResponse<T> {
  return { ok: true, data };
}

function fail(error: unknown): MessageResponse<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Request failed."
  };
}

function isMessageRequest(message: unknown): message is MessageRequest {
  return isPlainObject(message) && isString(message.type);
}

function rangeStart(range: HistoryRange, now: number): number {
  const todayStart = startOfLocalDay(now);

  switch (range) {
    case "today":
      return todayStart;
    case "yesterday":
      return todayStart - 24 * 60 * 60 * 1000;
    case "last-7-days":
      return todayStart - 6 * 24 * 60 * 60 * 1000;
  }
}

function rangeEnd(range: HistoryRange, now: number): number {
  const todayStart = startOfLocalDay(now);

  switch (range) {
    case "today":
      return startOfNextLocalDay(now);
    case "yesterday":
      return todayStart;
    case "last-7-days":
      return startOfNextLocalDay(now);
  }
}

async function getTodaySummary({
  dailyUsageRepository,
  runtimeStateStore,
  now: nowProvider
}: MessageRouterDependencies): Promise<TodaySummary> {
  const now = nowProvider?.() ?? Date.now();
  const dateKey = getDateKey(now);
  const rows = await dailyUsageRepository.listByDate(dateKey);
  const runtimeState = await runtimeStateStore.get(now);
  const liveRows = addLiveDurationToDailyRows(
    rows,
    runtimeState.status === "tracking" ? runtimeState.domain : null,
    runtimeState.status === "tracking" ? runtimeState.sessionStartedAt : null,
    now
  ).sort((a, b) => b.durationMs - a.durationMs);

  return {
    dateKey,
    totalDurationMs: liveRows.reduce((sum, row) => sum + row.durationMs, 0),
    currentDomain: runtimeState.status === "tracking" ? runtimeState.domain : null,
    currentSessionElapsedMs:
      runtimeState.status === "tracking" && runtimeState.sessionStartedAt
        ? Math.max(0, now - runtimeState.sessionStartedAt)
        : 0,
    domains: liveRows.map((row) => ({
      domain: row.domain,
      durationMs: row.durationMs,
      sessionCount: row.sessionCount
    }))
  };
}

async function getHistory(
  range: HistoryRange,
  dependencies: MessageRouterDependencies
): Promise<HistorySessionView[]> {
  const now = dependencies.now?.() ?? Date.now();
  const sessions = await dependencies.sessionRepository.getBetween(
    rangeStart(range, now),
    rangeEnd(range, now)
  );
  return sessions.map((session) => ({
    id: session.id,
    domain: session.domain,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: session.durationMs,
    dateKey: session.dateKey
  }));
}

async function syncSettingsSideEffects(
  settings: ExtensionSettings,
  dependencies: MessageRouterDependencies
): Promise<void> {
  browser.idle.setDetectionInterval(settings.idleThresholdSeconds);
  await dependencies.blockRuleManager.syncDynamicRules(settings.blockedDomains);
  await dependencies.trackingEngine.reconcileTrackingState(
    settings.trackingEnabled ? "settings-changed" : "tracking-disabled"
  );
  await dependencies.timeLimitManager.refresh();
}

async function routeMessage(
  message: MessageRequest,
  dependencies: MessageRouterDependencies
): Promise<MessageResponse<unknown>> {
  switch (message.type) {
    case "GET_TODAY_SUMMARY":
      return ok(await getTodaySummary(dependencies));

    case "GET_HISTORY":
      return ok(await getHistory(message.range, dependencies));

    case "GET_SETTINGS":
      return ok(await dependencies.settingsStore.get(dependencies.now?.() ?? Date.now()));

    case "UPDATE_SETTINGS": {
      const settings = await dependencies.settingsStore.update(
        {
          trackingEnabled: message.changes.trackingEnabled,
          idleThresholdSeconds: message.changes.idleThresholdSeconds,
          showBlockedAttemptCount: message.changes.showBlockedAttemptCount
        },
        dependencies.now?.() ?? Date.now()
      );
      await syncSettingsSideEffects(settings, dependencies);
      return ok(settings);
    }

    case "ADD_BLOCKED_DOMAIN": {
      await dependencies.settingsStore.addBlockedDomain(
        message.input,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.blockRuleManager.syncDynamicRules(settings.blockedDomains);
      return ok(settings);
    }

    case "REMOVE_BLOCKED_DOMAIN": {
      await dependencies.settingsStore.removeBlockedDomain(
        message.id,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.blockRuleManager.syncDynamicRules(settings.blockedDomains);
      return ok(settings);
    }

    case "SET_BLOCKED_DOMAIN_ENABLED": {
      await dependencies.settingsStore.setBlockedDomainEnabled(
        message.id,
        message.enabled,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.blockRuleManager.syncDynamicRules(settings.blockedDomains);
      return ok(settings);
    }

    case "ADD_TIME_LIMITED_DOMAIN": {
      await dependencies.settingsStore.addTimeLimitedDomain(
        message.input,
        message.limitMinutes,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.timeLimitManager.refresh();
      return ok(settings);
    }

    case "REMOVE_TIME_LIMITED_DOMAIN": {
      await dependencies.settingsStore.removeTimeLimitedDomain(
        message.id,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.timeLimitManager.refresh();
      return ok(settings);
    }

    case "SET_TIME_LIMITED_DOMAIN_ENABLED": {
      await dependencies.settingsStore.setTimeLimitedDomainEnabled(
        message.id,
        message.enabled,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.timeLimitManager.refresh();
      return ok(settings);
    }

    case "UPDATE_TIME_LIMITED_DOMAIN": {
      await dependencies.settingsStore.updateTimeLimitedDomain(
        message.id,
        message.limitMinutes,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.timeLimitManager.refresh();
      return ok(settings);
    }

    case "GET_TIME_LIMIT_STATUS":
      return ok(await dependencies.timeLimitManager.getStatus(message.domain));

    case "BYPASS_TIME_LIMIT":
      return ok(await dependencies.timeLimitManager.bypass(message.domain));

    case "GET_RUNTIME_STATE":
      return ok(await dependencies.runtimeStateStore.get(dependencies.now?.() ?? Date.now()));

    case "GET_BLOCKED_ATTEMPT_COUNT":
      return ok(await dependencies.blockAttemptRecorder.countToday(message.domain));

    case "RECORD_BLOCK_ATTEMPT":
      return ok(await dependencies.blockAttemptRecorder.recordNavigationAttempt(message.domain));
  }
}

export function registerMessageRouter(dependencies: MessageRouterDependencies): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isMessageRequest(message)) {
      return Promise.resolve(fail(new Error("Unsupported message.")));
    }

    return routeMessage(message, dependencies).catch(fail);
  });
}
