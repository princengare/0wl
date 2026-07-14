import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimeLimitManager } from "@/background/timeLimits/TimeLimitManager";
import { TimeLimitRuleManager } from "@/background/timeLimits/TimeLimitRuleManager";
import {
  buildTimeLimitRule,
  stableTimeLimitRuleIdForDomain
} from "@/background/timeLimits/TimeLimitRuleBuilder";
import { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import { SettingsStore } from "@/storage/SettingsStore";
import { WEEKDAYS, WEEKENDS } from "@/shared/schedule";
import type { DailyUsage, ScheduleConfig, UsageSession } from "@/shared/types";
import { MemoryStorageArea } from "./helpers/memoryStorage";

const TEST_NOW = new Date(2026, 6, 6, 12, 0, 0).getTime();
const TEST_DATE_KEY = "2026-07-06";

function makeBrowserMock() {
  let rules: browser.declarativeNetRequest.Rule[] = [];
  const updateDynamicRules = vi.fn(
    async ({
      removeRuleIds = [],
      addRules = []
    }: {
      removeRuleIds?: number[];
      addRules?: browser.declarativeNetRequest.Rule[];
    }) => {
      rules = rules.filter((rule) => !removeRuleIds.includes(rule.id));
      rules = [...rules, ...addRules];
    }
  );
  const tabsUpdate = vi.fn(async () => ({}));

  vi.stubGlobal("browser", {
    runtime: {
      getURL: (path: string) => `moz-extension://extension-id/${path}`
    },
    declarativeNetRequest: {
      getDynamicRules: vi.fn(async () => rules),
      updateDynamicRules
    },
    alarms: {
      clear: vi.fn(async () => true),
      create: vi.fn()
    },
    tabs: {
      get: vi.fn(async () => ({ id: 7, url: "https://github.com/openai" })),
      update: tabsUpdate
    }
  });

  return {
    get rules() {
      return rules;
    },
    tabsUpdate
  };
}

function createSession(domain: string, startedAt: number, endedAt: number): UsageSession {
  return {
    id: `${domain}-${startedAt}`,
    domain,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    startReason: "startup",
    endReason: "navigation",
    dateKey: TEST_DATE_KEY,
    createdAt: endedAt
  };
}

function createManager(rows: DailyUsage[], now = TEST_NOW, sessions: UsageSession[] = []) {
  const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
  const settingsStore = new SettingsStore(storage);
  const runtimeStateStore = new RuntimeStateStore(storage);
  const timeLimitRuleManager = new TimeLimitRuleManager();
  const manager = new TimeLimitManager({
    settingsStore,
    runtimeStateStore,
    timeLimitRuleManager,
    dailyUsageRepository: {
      listByDate: vi.fn(async () => rows)
    } as unknown as ConstructorParameters<typeof TimeLimitManager>[0]["dailyUsageRepository"],
    sessionRepository: {
      getOverlapping: vi.fn(async (start: number, end: number) =>
        sessions.filter((session) => session.endedAt > start && session.startedAt < end)
      )
    } as unknown as ConstructorParameters<typeof TimeLimitManager>[0]["sessionRepository"],
    now: () => now
  });

  return { manager, settingsStore, runtimeStateStore };
}

describe("time limits", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "time-limit-id"
    });
    makeBrowserMock();
  });

  it("normalizes time-limited domains and rejects duplicates", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);

    const limited = await settingsStore.addTimeLimitedDomain(
      "https://www.instagram.com/reels/",
      30,
      1
    );

    expect(limited.domain).toBe("instagram.com");
    await expect(settingsStore.addTimeLimitedDomain("m.instagram.com", 30, 2)).rejects.toThrow(
      "already has a time limit"
    );
  });

  it("edits time-limited domains and rejects duplicate edits", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);

    const limited = await settingsStore.addTimeLimitedDomain("instagram.com", 30, 1);
    await settingsStore.addTimeLimitedDomain("reddit.com", 30, 2);
    await settingsStore.updateTimeLimitedDomain(
      limited.id,
      45,
      { mode: "always" },
      3,
      "https://www.youtube.com/watch?v=123"
    );

    const settings = await settingsStore.get(4);
    expect(settings.timeLimitedDomains.find((row) => row.id === limited.id)).toMatchObject({
      domain: "youtube.com",
      limitMinutes: 45,
      bypassUntil: null
    });

    await expect(
      settingsStore.updateTimeLimitedDomain(limited.id, 45, { mode: "always" }, 5, "reddit.com")
    ).rejects.toThrow("already has a time limit");
  });

  it("builds stable main-frame redirect rules", () => {
    expect(stableTimeLimitRuleIdForDomain("instagram.com")).toBe(
      stableTimeLimitRuleIdForDomain("instagram.com")
    );
    expect(buildTimeLimitRule("instagram.com")).toMatchObject({
      id: stableTimeLimitRuleIdForDomain("instagram.com"),
      action: { type: "redirect" },
      condition: {
        urlFilter: "||instagram.com^",
        resourceTypes: ["main_frame"]
      }
    });
  });

  it("adds DNR rules for exceeded domains and removes them while bypassed", async () => {
    const browserMock = makeBrowserMock();
    const rows: DailyUsage[] = [
      {
        id: "1970-01-01::instagram.com",
        dateKey: TEST_DATE_KEY,
        domain: "instagram.com",
        durationMs: 60_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ];
    const { manager, settingsStore } = createManager(rows);
    await settingsStore.addTimeLimitedDomain("instagram.com", 1, 1);

    await manager.refresh();
    expect(browserMock.rules).toHaveLength(1);

    const status = await manager.bypass("instagram.com");
    expect(status.bypassUntil).toBe(TEST_NOW + 15 * 60 * 1000);
    expect(browserMock.rules).toHaveLength(0);
  });

  it("rejects bypass for arbitrary domains without an active limit", async () => {
    const { manager, settingsStore } = createManager([]);
    await settingsStore.addTimeLimitedDomain("instagram.com", 1, 1);

    await expect(manager.bypass("evil.com")).rejects.toThrow("does not currently have");
  });

  it("redirects the active tab when its limit is reached", async () => {
    const browserMock = makeBrowserMock();
    const rows: DailyUsage[] = [
      {
        id: `${TEST_DATE_KEY}::github.com`,
        dateKey: TEST_DATE_KEY,
        domain: "github.com",
        durationMs: 60_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ];
    const { manager, settingsStore, runtimeStateStore } = createManager(rows);
    await settingsStore.addTimeLimitedDomain("github.com", 1, 1);
    await runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      sessionStartedAt: 500,
      lastTransitionAt: 500,
      revision: 1
    });

    await manager.refresh();

    expect(browserMock.tabsUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        url: expect.stringContaining("limit.html")
      })
    );
  });

  it("enforces scheduled limits inside the active window", async () => {
    const browserMock = makeBrowserMock();
    const schedule: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: WEEKDAYS,
      startMinutes: 9 * 60,
      endMinutes: 17 * 60
    };
    const { manager, settingsStore } = createManager([], TEST_NOW, [
      createSession(
        "instagram.com",
        new Date(2026, 6, 6, 10, 0).getTime(),
        new Date(2026, 6, 6, 10, 1).getTime()
      )
    ]);
    await settingsStore.addTimeLimitedDomain("instagram.com", 1, 1, schedule);

    await manager.refresh();

    expect(browserMock.rules).toHaveLength(1);
  });

  it("does not enforce scheduled limits outside the active window", async () => {
    const browserMock = makeBrowserMock();
    const now = new Date(2026, 6, 6, 18, 0).getTime();
    const schedule: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: WEEKDAYS,
      startMinutes: 9 * 60,
      endMinutes: 17 * 60
    };
    const { manager, settingsStore } = createManager([], now, [
      createSession(
        "instagram.com",
        new Date(2026, 6, 6, 10, 0).getTime(),
        new Date(2026, 6, 6, 10, 10).getTime()
      )
    ]);
    await settingsStore.addTimeLimitedDomain("instagram.com", 1, 1, schedule);

    await manager.refresh();

    expect(browserMock.rules).toHaveLength(0);
  });

  it("supports weekend-only scheduled limits", async () => {
    const browserMock = makeBrowserMock();
    const now = new Date(2026, 6, 11, 12, 0).getTime();
    const schedule: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: WEEKENDS,
      startMinutes: 9 * 60,
      endMinutes: 17 * 60
    };
    const { manager, settingsStore } = createManager([], now, [
      createSession(
        "reddit.com",
        new Date(2026, 6, 11, 10, 0).getTime(),
        new Date(2026, 6, 11, 10, 1).getTime()
      )
    ]);
    await settingsStore.addTimeLimitedDomain("reddit.com", 1, 1, schedule);

    await manager.refresh();

    expect(browserMock.rules).toHaveLength(1);
  });

  it("counts only the scheduled overlap for midnight-crossing limits", async () => {
    const browserMock = makeBrowserMock();
    const now = new Date(2026, 6, 7, 1, 30).getTime();
    const schedule: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: [1],
      startMinutes: 22 * 60,
      endMinutes: 2 * 60
    };
    const { manager, settingsStore } = createManager([], now, [
      createSession(
        "youtube.com",
        new Date(2026, 6, 6, 21, 50).getTime(),
        new Date(2026, 6, 7, 0, 20).getTime()
      )
    ]);
    await settingsStore.addTimeLimitedDomain("youtube.com", 15, 1, schedule);

    await manager.refresh();

    expect(browserMock.rules).toHaveLength(1);
  });
});
