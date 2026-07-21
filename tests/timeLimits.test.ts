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
import type { DailyUsage, ScheduleConfig, UsageMode, UsageSession } from "@/shared/types";
import { MemoryStorageArea } from "./helpers/memoryStorage";

const TEST_NOW = new Date(2026, 6, 6, 12, 0, 0).getTime();
const TEST_DATE_KEY = "2026-07-06";

function makeBrowserMock(tabs: browser.tabs.Tab[] = []) {
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
      query: vi.fn(async () => tabs),
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

function createSession(
  domain: string,
  startedAt: number,
  endedAt: number,
  usageMode: UsageMode = "active"
): UsageSession {
  return {
    id: `${domain}-${startedAt}`,
    domain,
    usageMode,
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
  const trackingEngine = {
    stopTrackingForTab: vi.fn(async () => undefined)
  };
  const manager = new TimeLimitManager({
    settingsStore,
    runtimeStateStore,
    timeLimitRuleManager,
    trackingEngine,
    dailyUsageRepository: {
      listByDate: vi.fn(async (_dateKey: string, windowScope: "regular" | "private" = "regular") =>
        rows.filter((row) => (row.windowScope ?? "regular") === windowScope)
      )
    } as unknown as ConstructorParameters<typeof TimeLimitManager>[0]["dailyUsageRepository"],
    sessionRepository: {
      getOverlapping: vi.fn(async (start: number, end: number) =>
        sessions.filter((session) => session.endedAt > start && session.startedAt < end)
      )
    } as unknown as ConstructorParameters<typeof TimeLimitManager>[0]["sessionRepository"],
    now: () => now
  });

  return { manager, settingsStore, runtimeStateStore, trackingEngine };
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

  it("creates a browser-wide limit when the website input is blank", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);

    const limited = await settingsStore.addTimeLimitedDomain("   ", 90, 1);

    expect(limited).toMatchObject({
      domain: null,
      targetType: "global",
      windowScope: "regular",
      limitMinutes: 90
    });
    await expect(settingsStore.addTimeLimitedDomain("", 30, 2)).rejects.toThrow(
      "All Browsing already has a time limit"
    );
  });

  it("keeps regular and private time limits separate", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);

    await settingsStore.addTimeLimitedDomain("youtube.com", 30, 1);
    await settingsStore.addTimeLimitedDomain("youtube.com", 30, 2, { mode: "always" }, "private");

    expect(await settingsStore.getEnabledTimeLimitedDomains(3, "regular")).toHaveLength(1);
    expect(await settingsStore.getEnabledTimeLimitedDomains(3, "private")).toHaveLength(1);
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
      },
      {
        id: "1970-01-01::private::instagram.com",
        dateKey: TEST_DATE_KEY,
        domain: "instagram.com",
        windowScope: "private",
        durationMs: 60_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ];
    const { manager, settingsStore } = createManager(rows);
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    await settingsStore.addTimeLimitedDomain("instagram.com", 1, 1);
    await settingsStore.addTimeLimitedDomain("instagram.com", 1, 2, { mode: "always" }, "private");

    await manager.refresh();
    expect(browserMock.rules).toHaveLength(1);

    const status = await manager.bypass("instagram.com");
    expect(status.bypassUntil).toBe(TEST_NOW + 15 * 60 * 1000);
    expect(browserMock.rules).toHaveLength(0);
  });

  it("sums all regular browsing for a browser-wide limit", async () => {
    const rows: DailyUsage[] = [
      {
        id: `${TEST_DATE_KEY}::github.com`,
        dateKey: TEST_DATE_KEY,
        domain: "github.com",
        durationMs: 45_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      },
      {
        id: `${TEST_DATE_KEY}::youtube.com`,
        dateKey: TEST_DATE_KEY,
        domain: "youtube.com",
        durationMs: 30_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ];
    const { manager, settingsStore } = createManager(rows);
    await settingsStore.addTimeLimitedDomain("", 1, 1);

    const status = await manager.getStatus(undefined, "global", "regular");

    expect(status).toMatchObject({
      domain: null,
      targetType: "global",
      label: "All Browsing",
      usedMs: 75_000,
      exceeded: true
    });
  });

  it("creates private browser-wide limits from blank or whitespace input", async () => {
    const { manager, settingsStore } = createManager([
      {
        id: `${TEST_DATE_KEY}::private::github.com`,
        dateKey: TEST_DATE_KEY,
        domain: "github.com",
        windowScope: "private",
        durationMs: 75_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ]);
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    const limited = await settingsStore.addTimeLimitedDomain(
      "   ",
      1,
      2,
      { mode: "always" },
      "private"
    );

    const status = await manager.getStatus(undefined, "global", "private");

    expect(limited).toMatchObject({
      domain: null,
      targetType: "global",
      windowScope: "private"
    });
    expect(status).toMatchObject({
      label: "All Private Browsing",
      usedMs: 75_000,
      exceeded: true
    });
  });

  it("allows zero-minute limits only for private browsing", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);

    await expect(settingsStore.addTimeLimitedDomain("instagram.com", 0, 1)).rejects.toThrow(
      "Choose a supported time limit"
    );

    const limited = await settingsStore.addTimeLimitedDomain(
      "instagram.com",
      0,
      2,
      { mode: "always" },
      "private"
    );

    expect(limited).toMatchObject({
      domain: "instagram.com",
      targetType: "domain",
      windowScope: "private",
      limitMinutes: 0
    });
  });

  it("uses a zero-minute private global limit to block active private browsing", async () => {
    const browserMock = makeBrowserMock([
      {
        id: 10,
        url: "https://github.com/openai",
        incognito: true
      } as browser.tabs.Tab
    ]);
    const { manager, settingsStore } = createManager([]);
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    const limited = await settingsStore.addTimeLimitedDomain(
      "",
      0,
      2,
      { mode: "always" },
      "private"
    );
    const settings = await settingsStore.get(3);

    await manager.enforceOpenTabsIfExceeded(settings, {
      targetType: limited.targetType,
      windowScope: limited.windowScope
    });

    expect(browserMock.tabsUpdate).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        url: expect.stringContaining("limit.html")
      })
    );
  });

  it("stops tracking before a zero-minute private limit redirects a tab", async () => {
    makeBrowserMock([
      {
        id: 10,
        url: "https://github.com/openai",
        incognito: true
      } as browser.tabs.Tab
    ]);
    const { manager, settingsStore, trackingEngine } = createManager([]);
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    const limited = await settingsStore.addTimeLimitedDomain(
      "",
      0,
      2,
      { mode: "always" },
      "private"
    );
    const settings = await settingsStore.get(3);

    await manager.enforceOpenTabsIfExceeded(settings, {
      targetType: limited.targetType,
      windowScope: limited.windowScope
    });

    expect(trackingEngine.stopTrackingForTab).toHaveBeenCalledWith(10, "navigation");
  });

  it("keeps regular and private browser-wide limits from affecting each other", async () => {
    const { manager, settingsStore } = createManager([
      {
        id: `${TEST_DATE_KEY}::github.com`,
        dateKey: TEST_DATE_KEY,
        domain: "github.com",
        windowScope: "regular",
        durationMs: 30_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      },
      {
        id: `${TEST_DATE_KEY}::private::github.com`,
        dateKey: TEST_DATE_KEY,
        domain: "github.com",
        windowScope: "private",
        durationMs: 120_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ]);
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    await settingsStore.addTimeLimitedDomain("", 1, 2, { mode: "always" }, "regular");
    await settingsStore.addTimeLimitedDomain("", 1, 3, { mode: "always" }, "private");

    const regularStatus = await manager.getStatus(undefined, "global", "regular");
    const privateStatus = await manager.getStatus(undefined, "global", "private");

    expect(regularStatus.usedMs).toBe(30_000);
    expect(regularStatus.exceeded).toBe(false);
    expect(privateStatus.usedMs).toBe(120_000);
    expect(privateStatus.exceeded).toBe(true);
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

  it("immediately redirects open tabs when a global limit is already exceeded", async () => {
    const browserMock = makeBrowserMock([
      { id: 11, url: "https://github.com/openai", active: true, incognito: false }
    ] as browser.tabs.Tab[]);
    const rows: DailyUsage[] = [
      {
        id: `${TEST_DATE_KEY}::github.com`,
        dateKey: TEST_DATE_KEY,
        domain: "github.com",
        durationMs: 120_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ];
    const { manager, settingsStore } = createManager(rows);
    const limited = await settingsStore.addTimeLimitedDomain("", 1, 1);
    const settings = await settingsStore.get(2);

    await manager.enforceOpenTabsIfExceeded(settings, {
      targetType: limited.targetType,
      windowScope: limited.windowScope
    });

    expect(browserMock.tabsUpdate).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ url: expect.stringContaining("target=global") })
    );
  });

  it("does not redirect public 0wl app surface pages for exceeded global limits", async () => {
    const browserMock = makeBrowserMock([
      {
        id: 11,
        url: "https://princengare.github.io/0wl/privacy.html",
        active: true,
        incognito: false
      }
    ] as browser.tabs.Tab[]);
    const rows: DailyUsage[] = [
      {
        id: `${TEST_DATE_KEY}::github.com`,
        dateKey: TEST_DATE_KEY,
        domain: "github.com",
        durationMs: 120_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ];
    const { manager, settingsStore } = createManager(rows);
    const limited = await settingsStore.addTimeLimitedDomain("", 1, 1);
    const settings = await settingsStore.get(2);

    await manager.enforceOpenTabsIfExceeded(settings, {
      targetType: limited.targetType,
      windowScope: limited.windowScope
    });

    expect(browserMock.tabsUpdate).not.toHaveBeenCalled();
  });

  it("does not enforce private limits on regular tabs", async () => {
    const browserMock = makeBrowserMock([
      { id: 11, url: "https://youtube.com/watch?v=1", active: true, incognito: false }
    ] as browser.tabs.Tab[]);
    const rows: DailyUsage[] = [
      {
        id: `${TEST_DATE_KEY}::youtube.com`,
        dateKey: TEST_DATE_KEY,
        domain: "youtube.com",
        durationMs: 120_000,
        sessionCount: 1,
        lastUpdatedAt: 1
      }
    ];
    const { manager, settingsStore } = createManager(rows);
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    const limited = await settingsStore.addTimeLimitedDomain(
      "youtube.com",
      1,
      2,
      { mode: "always" },
      "private"
    );
    const settings = await settingsStore.get(3);

    await manager.enforceOpenTabsIfExceeded(settings, {
      domain: limited.domain ?? undefined,
      targetType: limited.targetType,
      windowScope: limited.windowScope
    });

    expect(browserMock.tabsUpdate).not.toHaveBeenCalled();
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
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    await settingsStore.addTimeLimitedDomain("instagram.com", 1, 1, schedule);
    await settingsStore.addTimeLimitedDomain("instagram.com", 1, 2, schedule, "private");

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
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    await settingsStore.addTimeLimitedDomain("reddit.com", 1, 1, schedule);
    await settingsStore.addTimeLimitedDomain("reddit.com", 1, 2, schedule, "private");

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
    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    await settingsStore.addTimeLimitedDomain("youtube.com", 15, 1, schedule);
    await settingsStore.addTimeLimitedDomain("youtube.com", 15, 2, schedule, "private");

    await manager.refresh();

    expect(browserMock.rules).toHaveLength(1);
  });

  it("does not count media sessions toward scheduled active browsing limits", async () => {
    const browserMock = makeBrowserMock();
    const schedule: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: WEEKDAYS,
      startMinutes: 9 * 60,
      endMinutes: 17 * 60
    };
    const { manager, settingsStore } = createManager([], TEST_NOW, [
      createSession(
        "youtube.com",
        new Date(2026, 6, 6, 10, 0).getTime(),
        new Date(2026, 6, 6, 10, 10).getTime(),
        "background"
      )
    ]);
    await settingsStore.addTimeLimitedDomain("youtube.com", 1, 1, schedule);

    await manager.refresh();

    expect(browserMock.rules).toHaveLength(0);
  });
});
