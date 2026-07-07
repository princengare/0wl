import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimeLimitManager } from "@/background/timeLimits/TimeLimitManager";
import { TimeLimitRuleManager } from "@/background/timeLimits/TimeLimitRuleManager";
import {
  buildTimeLimitRule,
  stableTimeLimitRuleIdForDomain
} from "@/background/timeLimits/TimeLimitRuleBuilder";
import { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import { SettingsStore } from "@/storage/SettingsStore";
import type { DailyUsage } from "@/shared/types";
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

function createManager(rows: DailyUsage[], now = TEST_NOW) {
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
        url: expect.stringContaining("limit/index.html")
      })
    );
  });
});
