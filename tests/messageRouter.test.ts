import { describe, expect, it, vi } from "vitest";
import { routeMessage } from "@/background/messaging/messageRouter";
import { SettingsStore } from "@/storage/SettingsStore";
import { ALWAYS_SCHEDULE } from "@/shared/schedule";
import type { HistorySessionView, TodaySummary, UsageSession } from "@/shared/types";
import type { VisionRecommendation } from "@/vision/types";
import { MemoryStorageArea } from "./helpers/memoryStorage";

const NOW = new Date(2026, 6, 6, 12, 0, 0).getTime();

function inactiveRuntimeState() {
  return {
    status: "inactive",
    activeTabId: null,
    activeWindowId: null,
    domain: null,
    windowScope: "regular",
    sessionStartedAt: null,
    lastTransitionAt: NOW,
    revision: 1
  };
}

describe("message router history", () => {
  it("does not surface stale private live sessions as impossible history bars", async () => {
    const repairUsageData = vi.fn(async () => ({
      removedSessions: 0,
      rebuiltDailyUsageRecords: 0,
      resetStaleRuntimeState: false
    }));
    const dependencies = {
      sessionRepository: {
        getOverlapping: vi.fn(async () => [])
      },
      runtimeStateStore: {
        get: vi.fn(async () => ({
          status: "tracking",
          activeTabId: 4,
          activeWindowId: 2,
          domain: "youtube.com",
          windowScope: "private",
          sessionStartedAt: NOW - 38 * 60 * 60 * 1000,
          lastTransitionAt: NOW - 38 * 60 * 60 * 1000,
          revision: 8
        }))
      },
      mediaActivityTracker: {
        getLiveSessions: vi.fn(async () => [])
      },
      dataControlService: {
        repairUsageData
      },
      now: () => NOW
    } as unknown as Parameters<typeof routeMessage>[1];

    const response = await routeMessage(
      {
        type: "GET_HISTORY_INTERVAL",
        startedAt: NOW - 60 * 60 * 1000,
        endedAt: NOW,
        windowScope: "private",
        usageMode: "active"
      },
      dependencies
    );

    expect(response.ok).toBe(true);
    expect(repairUsageData).toHaveBeenCalledTimes(1);
    if (!response.ok) {
      throw new Error(response.error);
    }

    expect(response.data).toEqual([]);
  });

  it("keeps regular live tracking visible when legacy runtime scope is missing", async () => {
    const dependencies = {
      sessionRepository: {
        getOverlapping: vi.fn(async () => [])
      },
      runtimeStateStore: {
        get: vi.fn(async () => ({
          status: "tracking",
          activeTabId: 4,
          activeWindowId: 2,
          domain: "github.com",
          sessionStartedAt: NOW - 10 * 60 * 1000,
          lastTransitionAt: NOW - 10 * 60 * 1000,
          revision: 8
        }))
      },
      mediaActivityTracker: {
        getLiveSessions: vi.fn(async () => [])
      },
      dataControlService: {
        repairUsageData: vi.fn(async () => ({
          removedSessions: 0,
          rebuiltDailyUsageRecords: 0,
          resetStaleRuntimeState: false
        }))
      },
      now: () => NOW
    } as unknown as Parameters<typeof routeMessage>[1];

    const response = await routeMessage(
      {
        type: "GET_HISTORY_INTERVAL",
        startedAt: NOW - 60 * 60 * 1000,
        endedAt: NOW,
        windowScope: "regular",
        usageMode: "active"
      },
      dependencies
    );

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error);
    }

    expect(response.data as HistorySessionView[]).toEqual([
      {
        id: "runtime-current-session",
        domain: "github.com",
        windowScope: "regular",
        usageMode: "active",
        aggregateOnly: false,
        startedAt: NOW - 10 * 60 * 1000,
        endedAt: NOW,
        durationMs: 10 * 60 * 1000,
        dateKey: "2026-07-06"
      }
    ]);
  });

  it("repairs usage before today summary and keeps legacy live scope visible", async () => {
    const repairUsageData = vi.fn(async () => ({
      removedSessions: 0,
      rebuiltDailyUsageRecords: 0,
      resetStaleRuntimeState: false
    }));
    const dependencies = {
      dailyUsageRepository: {
        listByDate: vi.fn(async () => [])
      },
      runtimeStateStore: {
        get: vi.fn(async () => ({
          status: "tracking",
          activeTabId: 4,
          activeWindowId: 2,
          domain: "github.com",
          sessionStartedAt: NOW - 10 * 60 * 1000,
          lastTransitionAt: NOW - 10 * 60 * 1000,
          revision: 8
        }))
      },
      dataControlService: {
        repairUsageData
      },
      now: () => NOW
    } as unknown as Parameters<typeof routeMessage>[1];

    const response = await routeMessage({ type: "GET_TODAY_SUMMARY" }, dependencies);

    expect(response.ok).toBe(true);
    expect(repairUsageData).toHaveBeenCalledTimes(1);
    if (!response.ok) {
      throw new Error(response.error);
    }

    expect(response.data as TodaySummary).toMatchObject({
      currentDomain: "github.com",
      currentSessionElapsedMs: 10 * 60 * 1000,
      totalDurationMs: 10 * 60 * 1000,
      domains: [
        {
          domain: "github.com",
          durationMs: 10 * 60 * 1000,
          sessionCount: 0
        }
      ]
    });
  });

  it("includes live background media sessions in history responses", async () => {
    const liveSession: UsageSession = {
      id: "runtime-youtube",
      domain: "youtube.com",
      windowScope: "regular",
      usageMode: "background",
      startedAt: NOW - 45_000,
      endedAt: NOW,
      durationMs: 45_000,
      startReason: "media-started",
      endReason: "media-stopped",
      dateKey: "2026-07-06",
      createdAt: NOW
    };
    const getLiveSessions = vi.fn(async () => [liveSession]);
    const dependencies = {
      sessionRepository: {
        getOverlapping: vi.fn(async () => [])
      },
      runtimeStateStore: {
        get: vi.fn(async () => inactiveRuntimeState())
      },
      mediaActivityTracker: {
        getLiveSessions
      },
      now: () => NOW
    } as unknown as Parameters<typeof routeMessage>[1];

    const response = await routeMessage(
      {
        type: "GET_HISTORY_INTERVAL",
        startedAt: NOW - 60_000,
        endedAt: NOW + 60_000,
        windowScope: "regular",
        usageMode: "background"
      },
      dependencies
    );

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error);
    }

    expect(getLiveSessions).toHaveBeenCalledWith(
      NOW - 60_000,
      NOW + 60_000,
      "regular",
      "background"
    );
    expect(response.data as HistorySessionView[]).toEqual([
      {
        id: "runtime-youtube",
        domain: "youtube.com",
        windowScope: "regular",
        usageMode: "background",
        aggregateOnly: false,
        startedAt: NOW - 45_000,
        endedAt: NOW,
        durationMs: 45_000,
        dateKey: "2026-07-06"
      }
    ]);
  });

  it("applies a Vision block recommendation by updating an existing blocked-site schedule", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);
    await settingsStore.addBlockedDomain("instagram.com", NOW, ALWAYS_SCHEDULE, "regular");
    const schedule = {
      mode: "custom" as const,
      daysOfWeek: [1 as const],
      startMinutes: 13 * 60,
      endMinutes: 14 * 60
    };
    const recommendation: VisionRecommendation = {
      id: "heatmap:1:13:instagram.com",
      title: "Schedule a block around repeated attempts",
      reason: "instagram.com attempts cluster around 1:00 PM-2:00 PM.",
      supportingMetric: "3 attempts in this hour bucket",
      proposedAction: "Create or update a scheduled block for instagram.com.",
      strength: "high",
      domains: ["instagram.com"],
      action: {
        type: "add_block",
        domain: "instagram.com",
        schedule
      }
    };
    const refreshDynamicRules = vi.fn(async () => undefined);
    const enforceMatchingTabs = vi.fn(async () => undefined);
    const dismissRecommendation = vi.fn(async () => undefined);
    const buildReport = vi.fn(async () => ({ recommendations: [recommendation] }));
    const dependencies = {
      settingsStore,
      blockRuleManager: {
        refreshDynamicRules,
        enforceMatchingTabs
      },
      visionSettingsStore: {
        dismissRecommendation
      },
      visionReportService: {
        buildReport
      },
      now: () => NOW + 1
    } as unknown as Parameters<typeof routeMessage>[1];

    const response = await routeMessage(
      { type: "APPLY_VISION_RECOMMENDATION", id: recommendation.id },
      dependencies
    );
    const settings = await settingsStore.get(NOW + 2);

    expect(response.ok).toBe(true);
    expect(settings.blockedDomains).toHaveLength(1);
    expect(settings.blockedDomains[0]).toMatchObject({
      domain: "instagram.com",
      windowScope: "regular",
      schedule
    });
    expect(refreshDynamicRules).toHaveBeenCalledWith(
      settings.blockedDomains,
      NOW + 1,
      settings.privateBrowserTrackingEnabled
    );
    expect(enforceMatchingTabs).toHaveBeenCalledWith(settings, {
      domain: "instagram.com",
      windowScope: "regular"
    });
    expect(dismissRecommendation).toHaveBeenCalledWith(recommendation.id, NOW + 1);
  });
});
