import type { BlockRuleManager } from "../blocking/BlockRuleManager";
import type { BlockAttemptRecorder } from "../blocking/BlockAttemptRecorder";
import type { ScheduledBreakManager } from "../breaks/ScheduledBreakManager";
import type { DataControlService } from "../dataControl/DataControlService";
import type { MediaActivityTracker } from "../media/MediaActivityTracker";
import type { TimeLimitManager } from "../timeLimits/TimeLimitManager";
import type { TrackingEngine } from "../tracking/TrackingEngine";
import type { BlockAttemptRepository } from "@/db/repositories/BlockAttemptRepository";
import type { DailyUsageRepository } from "@/db/repositories/DailyUsageRepository";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import type { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import type { SettingsStore } from "@/storage/SettingsStore";
import type { LocalDeviceSyncService } from "@/sync/LocalDeviceSyncService";
import { browser } from "@/shared/browser";
import { MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS } from "@/shared/constants";
import { setIdleDetectionInterval } from "@/platform/idleApi";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { DomainClassifier } from "@/vision/classification/DomainClassifier";
import type { IntentPromptManager } from "@/vision/friction/IntentPromptManager";
import type { FrictionRuleManager } from "@/vision/friction/FrictionRuleManager";
import type { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import type { VisionReportService } from "@/vision/VisionReportService";
import {
  addLiveDurationToDailyRows,
  getDateKey,
  startOfLocalDay,
  startOfNextLocalDay
} from "@/shared/time";
import { isPlainObject, isString } from "@/shared/validation";
import { toHistorySessionView } from "@/shared/historyPrivacy";
import type {
  ExtensionSettings,
  HistoryRange,
  HistorySessionView,
  MessageRequest,
  MessageResponse,
  UsageMode,
  WindowScope,
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
  scheduledBreakManager: ScheduledBreakManager;
  trackingEngine: TrackingEngine;
  mediaActivityTracker: MediaActivityTracker;
  domainClassifier: DomainClassifier;
  visionSettingsStore: VisionSettingsStore;
  frictionRuleManager: FrictionRuleManager;
  intentPromptManager: IntentPromptManager;
  visionReportService: VisionReportService;
  dataControlService: DataControlService;
  localDeviceSyncService: LocalDeviceSyncService;
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

function normalizeUsageMode(value: UsageMode | undefined): UsageMode {
  return value === "pip" || value === "background" ? value : "active";
}

function isReasonableLiveSession(sessionStartedAt: number | null, now: number): boolean {
  return (
    sessionStartedAt !== null &&
    sessionStartedAt < now &&
    now - sessionStartedAt < MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS
  );
}

async function repairUsageDataIfAvailable(dependencies: MessageRouterDependencies): Promise<void> {
  await dependencies.dataControlService?.repairUsageData?.();
}

async function getTodaySummary({
  dailyUsageRepository,
  runtimeStateStore,
  now: nowProvider
}: MessageRouterDependencies): Promise<TodaySummary> {
  const now = nowProvider?.() ?? Date.now();
  const dateKey = getDateKey(now);
  const rows = await dailyUsageRepository.listByDate(dateKey, "regular");
  const runtimeState = await runtimeStateStore.get(now);
  const liveSessionStartedAt = runtimeState.sessionStartedAt;
  const hasRegularLiveSession =
    runtimeState.status === "tracking" &&
    normalizeWindowScope(runtimeState.windowScope) === "regular" &&
    isReasonableLiveSession(liveSessionStartedAt, now);
  const liveRows = addLiveDurationToDailyRows(
    rows,
    hasRegularLiveSession ? runtimeState.domain : null,
    hasRegularLiveSession ? liveSessionStartedAt : null,
    now
  ).sort((a, b) => b.durationMs - a.durationMs);

  return {
    dateKey,
    totalDurationMs: liveRows.reduce((sum, row) => sum + row.durationMs, 0),
    currentDomain: hasRegularLiveSession ? runtimeState.domain : null,
    currentSessionElapsedMs:
      hasRegularLiveSession && liveSessionStartedAt !== null
        ? Math.max(0, now - liveSessionStartedAt)
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
  dependencies: MessageRouterDependencies,
  windowScope: WindowScope = "regular",
  usageMode: UsageMode = "active"
): Promise<HistorySessionView[]> {
  const now = dependencies.now?.() ?? Date.now();
  return getHistoryInterval(
    rangeStart(range, now),
    rangeEnd(range, now),
    dependencies,
    windowScope,
    usageMode
  );
}

async function getHistoryInterval(
  start: number,
  end: number,
  dependencies: MessageRouterDependencies,
  windowScopeInput: WindowScope = "regular",
  usageModeInput: UsageMode = "active"
): Promise<HistorySessionView[]> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }

  const now = dependencies.now?.() ?? Date.now();
  const windowScope = normalizeWindowScope(windowScopeInput);
  const usageMode = normalizeUsageMode(usageModeInput);

  const sessions = await dependencies.sessionRepository.getOverlapping(
    start,
    end,
    windowScope,
    usageMode
  );
  const runtimeState = await dependencies.runtimeStateStore.get(now);
  const liveSessionStartedAt = runtimeState.sessionStartedAt;
  const liveMediaSessions =
    usageMode === "active"
      ? []
      : await dependencies.mediaActivityTracker.getLiveSessions(start, end, windowScope, usageMode);
  const rows = [...sessions, ...liveMediaSessions]
    .map((session) => toHistorySessionView(session, windowScope, usageMode))
    .sort((a, b) => b.startedAt - a.startedAt);

  if (
    usageMode === "active" &&
    runtimeState.status === "tracking" &&
    normalizeWindowScope(runtimeState.windowScope) === windowScope &&
    runtimeState.domain &&
    isReasonableLiveSession(liveSessionStartedAt, now) &&
    liveSessionStartedAt !== null &&
    liveSessionStartedAt < end &&
    now > start
  ) {
    const startedAt = Math.max(liveSessionStartedAt, start);
    const endedAt = Math.min(now, end);

    if (endedAt > startedAt) {
      rows.unshift({
        id: "runtime-current-session",
        domain: windowScope === "private" ? "Private browsing" : runtimeState.domain,
        windowScope,
        usageMode,
        aggregateOnly: windowScope === "private",
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        dateKey: getDateKey(startedAt)
      });
    }
  }

  return rows;
}

async function syncSettingsSideEffects(
  settings: ExtensionSettings,
  dependencies: MessageRouterDependencies
): Promise<void> {
  setIdleDetectionInterval(settings.idleThresholdSeconds);
  await dependencies.blockRuleManager.refreshDynamicRules(
    settings.blockedDomains,
    dependencies.now?.() ?? Date.now(),
    settings.privateBrowserTrackingEnabled
  );
  await dependencies.blockRuleManager.enforceMatchingTabs(settings);
  await dependencies.trackingEngine.reconcileTrackingState(
    settings.trackingEnabled ? "settings-changed" : "tracking-disabled"
  );
  await dependencies.timeLimitManager.refresh();
  await dependencies.scheduledBreakManager.refresh();
}

export async function routeMessage(
  message: MessageRequest,
  dependencies: MessageRouterDependencies,
  sender?: browser.runtime.MessageSender
): Promise<MessageResponse<unknown>> {
  switch (message.type) {
    case "GET_TODAY_SUMMARY":
      await repairUsageDataIfAvailable(dependencies);
      return ok(await getTodaySummary(dependencies));

    case "GET_HISTORY":
      await repairUsageDataIfAvailable(dependencies);
      return ok(
        await getHistory(
          message.range,
          dependencies,
          normalizeWindowScope(message.windowScope),
          normalizeUsageMode(message.usageMode)
        )
      );

    case "GET_HISTORY_INTERVAL":
      await repairUsageDataIfAvailable(dependencies);
      return ok(
        await getHistoryInterval(
          message.startedAt,
          message.endedAt,
          dependencies,
          normalizeWindowScope(message.windowScope),
          normalizeUsageMode(message.usageMode)
        )
      );

    case "GET_SETTINGS":
      return ok(await dependencies.settingsStore.get(dependencies.now?.() ?? Date.now()));

    case "UPDATE_SETTINGS": {
      const settings = await dependencies.settingsStore.update(
        {
          trackingEnabled: message.changes.trackingEnabled,
          privateBrowserTrackingEnabled: message.changes.privateBrowserTrackingEnabled,
          idleThresholdSeconds: message.changes.idleThresholdSeconds,
          showBlockedAttemptCount: message.changes.showBlockedAttemptCount,
          historyRetentionDays: message.changes.historyRetentionDays
        },
        dependencies.now?.() ?? Date.now()
      );
      await syncSettingsSideEffects(settings, dependencies);
      return ok(settings);
    }

    case "ADD_BLOCKED_DOMAIN": {
      const blocked = await dependencies.settingsStore.addBlockedDomain(
        message.input,
        dependencies.now?.() ?? Date.now(),
        message.schedule,
        message.windowScope
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.blockRuleManager.refreshDynamicRules(
        settings.blockedDomains,
        dependencies.now?.() ?? Date.now(),
        settings.privateBrowserTrackingEnabled
      );
      await dependencies.blockRuleManager.enforceMatchingTabs(settings, {
        domain: blocked.domain,
        windowScope: blocked.windowScope
      });
      return ok(settings);
    }

    case "REMOVE_BLOCKED_DOMAIN": {
      await dependencies.settingsStore.removeBlockedDomain(
        message.id,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.blockRuleManager.refreshDynamicRules(
        settings.blockedDomains,
        dependencies.now?.() ?? Date.now(),
        settings.privateBrowserTrackingEnabled
      );
      return ok(settings);
    }

    case "SET_BLOCKED_DOMAIN_ENABLED": {
      await dependencies.settingsStore.setBlockedDomainEnabled(
        message.id,
        message.enabled,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.blockRuleManager.refreshDynamicRules(
        settings.blockedDomains,
        dependencies.now?.() ?? Date.now(),
        settings.privateBrowserTrackingEnabled
      );
      if (message.enabled) {
        const blocked = settings.blockedDomains.find((row) => row.id === message.id);
        await dependencies.blockRuleManager.enforceMatchingTabs(settings, {
          domain: blocked?.domain,
          windowScope: blocked?.windowScope
        });
      }
      return ok(settings);
    }

    case "UPDATE_BLOCKED_DOMAIN": {
      await dependencies.settingsStore.updateBlockedDomain(
        message.id,
        message.input,
        message.schedule,
        dependencies.now?.() ?? Date.now(),
        message.windowScope
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.blockRuleManager.refreshDynamicRules(
        settings.blockedDomains,
        dependencies.now?.() ?? Date.now(),
        settings.privateBrowserTrackingEnabled
      );
      const blocked = settings.blockedDomains.find((row) => row.id === message.id);
      await dependencies.blockRuleManager.enforceMatchingTabs(settings, {
        domain: blocked?.domain,
        windowScope: blocked?.windowScope
      });
      return ok(settings);
    }

    case "UPDATE_BLOCKED_DOMAIN_SCHEDULE": {
      await dependencies.settingsStore.updateBlockedDomainSchedule(
        message.id,
        message.schedule,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.blockRuleManager.refreshDynamicRules(
        settings.blockedDomains,
        dependencies.now?.() ?? Date.now(),
        settings.privateBrowserTrackingEnabled
      );
      const blocked = settings.blockedDomains.find((row) => row.id === message.id);
      await dependencies.blockRuleManager.enforceMatchingTabs(settings, {
        domain: blocked?.domain,
        windowScope: blocked?.windowScope
      });
      return ok(settings);
    }

    case "ADD_TIME_LIMITED_DOMAIN": {
      const limited = await dependencies.settingsStore.addTimeLimitedDomain(
        message.input,
        message.limitMinutes,
        dependencies.now?.() ?? Date.now(),
        message.schedule,
        message.windowScope
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.timeLimitManager.refresh();
      await dependencies.timeLimitManager.enforceOpenTabsIfExceeded(settings, {
        domain: limited.domain ?? undefined,
        targetType: limited.targetType,
        windowScope: limited.windowScope
      });
      return ok(settings);
    }

    case "ADD_SCHEDULED_BREAK_RULE": {
      await dependencies.settingsStore.addScheduledBreakRule(
        message.breakAfterMinutes,
        dependencies.now?.() ?? Date.now(),
        message.schedule,
        message.windowScope,
        message.breakDurationMinutes
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.scheduledBreakManager.refresh();
      return ok(settings);
    }

    case "REMOVE_SCHEDULED_BREAK_RULE": {
      await dependencies.settingsStore.removeScheduledBreakRule(
        message.id,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.scheduledBreakManager.refresh();
      return ok(settings);
    }

    case "SET_SCHEDULED_BREAK_RULE_ENABLED": {
      await dependencies.settingsStore.setScheduledBreakRuleEnabled(
        message.id,
        message.enabled,
        dependencies.now?.() ?? Date.now()
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.scheduledBreakManager.refresh();
      return ok(settings);
    }

    case "UPDATE_SCHEDULED_BREAK_RULE": {
      await dependencies.settingsStore.updateScheduledBreakRule(
        message.id,
        message.breakAfterMinutes,
        message.schedule,
        dependencies.now?.() ?? Date.now(),
        message.windowScope,
        message.breakDurationMinutes
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.scheduledBreakManager.refresh();
      return ok(settings);
    }

    case "GET_SCHEDULED_BREAK_STATUS":
      return ok(await dependencies.scheduledBreakManager.getStatus(message.windowScope));

    case "SET_SCHEDULED_BREAK_DND":
      return ok(
        await dependencies.scheduledBreakManager.setDnd(message.enabled, message.windowScope)
      );

    case "END_SCHEDULED_BREAK":
      return ok(await dependencies.scheduledBreakManager.endActiveBreak(message.windowScope));

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
      if (message.enabled) {
        const limited = settings.timeLimitedDomains.find((row) => row.id === message.id);
        await dependencies.timeLimitManager.enforceOpenTabsIfExceeded(settings, {
          domain: limited?.domain ?? undefined,
          targetType: limited?.targetType,
          windowScope: limited?.windowScope
        });
      }
      return ok(settings);
    }

    case "UPDATE_TIME_LIMITED_DOMAIN": {
      await dependencies.settingsStore.updateTimeLimitedDomain(
        message.id,
        message.limitMinutes,
        message.schedule,
        dependencies.now?.() ?? Date.now(),
        message.input,
        message.windowScope
      );
      const settings = await dependencies.settingsStore.get();
      await dependencies.timeLimitManager.refresh();
      const limited = settings.timeLimitedDomains.find((row) => row.id === message.id);
      await dependencies.timeLimitManager.enforceOpenTabsIfExceeded(settings, {
        domain: limited?.domain ?? undefined,
        targetType: limited?.targetType,
        windowScope: limited?.windowScope
      });
      return ok(settings);
    }

    case "GET_TIME_LIMIT_STATUS":
      return ok(
        await dependencies.timeLimitManager.getStatus(
          message.domain,
          message.targetType,
          message.windowScope
        )
      );

    case "BYPASS_TIME_LIMIT":
      return ok(
        await dependencies.timeLimitManager.bypass(
          message.domain,
          message.targetType,
          message.windowScope
        )
      );

    case "GET_VISION_REPORT":
      return ok(await dependencies.visionReportService.buildReport());

    case "SET_DOMAIN_CLASSIFICATION": {
      await dependencies.domainClassifier.setUserClassification(
        message.domain,
        message.primaryCategory,
        message.secondaryCategories ?? []
      );
      return ok(await dependencies.visionReportService.buildReport());
    }

    case "RESET_DOMAIN_CLASSIFICATION": {
      await dependencies.domainClassifier.resetUserClassification(message.domain);
      return ok(await dependencies.visionReportService.buildReport());
    }

    case "UPDATE_VISION_SETTINGS": {
      const settings = await dependencies.visionSettingsStore.update(
        message.changes,
        dependencies.now?.() ?? Date.now()
      );
      await dependencies.frictionRuleManager.refreshDynamicRules(settings.frictionRules);
      return ok(settings);
    }

    case "DISMISS_VISION_RECOMMENDATION": {
      await dependencies.visionSettingsStore.dismissRecommendation(
        message.id,
        dependencies.now?.() ?? Date.now()
      );
      return ok(await dependencies.visionReportService.buildReport());
    }

    case "APPLY_VISION_RECOMMENDATION": {
      const report = await dependencies.visionReportService.buildReport();
      const recommendation = report.recommendations.find((row) => row.id === message.id);

      if (!recommendation) {
        throw new Error("Recommendation is no longer available.");
      }

      if (recommendation.action.type === "add_block") {
        const action = recommendation.action;
        const now = dependencies.now?.() ?? Date.now();
        const currentSettings = await dependencies.settingsStore.get(now);
        const existingBlocked = currentSettings.blockedDomains.find(
          (blocked) =>
            blocked.domain === action.domain &&
            normalizeWindowScope(blocked.windowScope) === "regular"
        );

        if (existingBlocked) {
          await dependencies.settingsStore.updateBlockedDomain(
            existingBlocked.id,
            action.domain,
            action.schedule,
            now,
            "regular"
          );
        } else {
          await dependencies.settingsStore.addBlockedDomain(
            action.domain,
            now,
            action.schedule,
            "regular"
          );
        }

        const settings = await dependencies.settingsStore.get(now);
        await dependencies.blockRuleManager.refreshDynamicRules(
          settings.blockedDomains,
          now,
          settings.privateBrowserTrackingEnabled
        );
        await dependencies.blockRuleManager.enforceMatchingTabs(settings, {
          domain: action.domain,
          windowScope: "regular"
        });
      } else if (recommendation.action.type === "add_friction") {
        const settings = await dependencies.visionSettingsStore.upsertFrictionRule(
          recommendation.action.domain,
          recommendation.action.level,
          recommendation.action.schedule,
          true,
          dependencies.now?.() ?? Date.now()
        );
        await dependencies.frictionRuleManager.refreshDynamicRules(settings.frictionRules);
      }

      await dependencies.visionSettingsStore.dismissRecommendation(
        message.id,
        dependencies.now?.() ?? Date.now()
      );
      return ok(await dependencies.visionReportService.buildReport());
    }

    case "UPSERT_FRICTION_RULE": {
      const settings = await dependencies.visionSettingsStore.upsertFrictionRule(
        message.domain,
        message.level,
        message.schedule,
        message.enabled ?? true,
        dependencies.now?.() ?? Date.now()
      );
      await dependencies.frictionRuleManager.refreshDynamicRules(settings.frictionRules);
      return ok(await dependencies.visionReportService.buildReport());
    }

    case "REMOVE_FRICTION_RULE": {
      const settings = await dependencies.visionSettingsStore.removeFrictionRule(
        message.id,
        dependencies.now?.() ?? Date.now()
      );
      await dependencies.frictionRuleManager.refreshDynamicRules(settings.frictionRules);
      return ok(await dependencies.visionReportService.buildReport());
    }

    case "RECORD_BROWSING_INTENT":
      return ok(
        await dependencies.intentPromptManager.record(
          message.domain,
          message.intent,
          message.outcome,
          dependencies.now?.() ?? Date.now()
        )
      );

    case "GET_RUNTIME_STATE":
      return ok(await dependencies.runtimeStateStore.get(dependencies.now?.() ?? Date.now()));

    case "GET_DATA_CONTROL_STATUS":
      return ok(await dependencies.dataControlService.getStatus());

    case "EXPORT_ALL_DATA":
      return ok(await dependencies.dataControlService.exportAllData());

    case "IMPORT_DATA_BACKUP":
      return ok(await dependencies.dataControlService.importBackup(message.backup, message.mode));

    case "EXPORT_LOCAL_SYNC_BUNDLE":
      return ok(
        await dependencies.localDeviceSyncService.exportBundle(message.includePrivateData ?? false)
      );

    case "PREVIEW_LOCAL_SYNC_IMPORT":
      return ok(await dependencies.localDeviceSyncService.previewImport(message.bundle));

    case "GET_LOCAL_SYNC_DIAGNOSTICS":
      return ok(await dependencies.localDeviceSyncService.getDiagnostics());

    case "APPLY_LOCAL_SYNC_IMPORT":
      return ok(
        await dependencies.localDeviceSyncService.applyImport(
          message.bundle,
          message.conflictResolution
        )
      );

    case "SET_HISTORY_RETENTION":
      return ok(
        await dependencies.dataControlService.setHistoryRetention(message.historyRetentionDays)
      );

    case "DELETE_LOCAL_DATA":
      return ok(await dependencies.dataControlService.deleteTarget(message.target));

    case "CLEAR_PRIVATE_BROWSING_DATA":
      return ok(await dependencies.dataControlService.clearPrivateBrowsingData());

    case "RESET_ALL_LOCAL_DATA":
      return ok(await dependencies.dataControlService.resetAllLocalData(message.confirmation));

    case "GET_BLOCKED_ATTEMPT_COUNT":
      return ok(
        await dependencies.blockAttemptRecorder.countToday(message.domain, message.windowScope)
      );

    case "RECORD_BLOCK_ATTEMPT":
      return ok(
        await dependencies.blockAttemptRecorder.recordNavigationAttempt(
          message.domain,
          message.windowScope
        )
      );

    case "REPORT_MEDIA_STATE":
      await dependencies.mediaActivityTracker.handleMediaStateReport(message, sender);
      return ok({ recorded: true });
  }
}

export function registerMessageRouter(dependencies: MessageRouterDependencies): void {
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!isMessageRequest(message)) {
      return Promise.resolve(fail(new Error("Unsupported message.")));
    }

    return routeMessage(message, dependencies, sender).catch(fail);
  });
}
