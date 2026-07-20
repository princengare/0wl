import { describe, expect, it, vi } from "vitest";
import { routeMessage } from "@/background/messaging/messageRouter";
import type { HistorySessionView, UsageSession } from "@/shared/types";

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
});
