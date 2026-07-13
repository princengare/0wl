import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockAttemptRecorder } from "@/background/blocking/BlockAttemptRecorder";
import { BlockRuleManager } from "@/background/blocking/BlockRuleManager";
import { isDomainBlocked } from "@/background/blocking/BlockedDomainMatcher";
import {
  buildDynamicBlockRule,
  stableRuleIdForDomain
} from "@/background/blocking/DynamicRuleBuilder";
import { SettingsStore } from "@/storage/SettingsStore";
import { ALWAYS_SCHEDULE, WEEKDAYS } from "@/shared/schedule";
import type { BlockAttempt, BlockedDomain } from "@/shared/types";
import { MemoryStorageArea } from "./helpers/memoryStorage";

interface DynamicUpdateOptions {
  removeRuleIds?: number[];
  addRules?: browser.declarativeNetRequest.Rule[];
}

function makeBrowserMock() {
  let rules: browser.declarativeNetRequest.Rule[] = [];
  const updateDynamicRules = vi.fn(
    async ({ removeRuleIds = [], addRules = [] }: DynamicUpdateOptions) => {
      rules = rules.filter((rule) => !removeRuleIds.includes(rule.id));
      rules = [...rules, ...addRules];
    }
  );

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
    }
  });

  return {
    get rules() {
      return rules;
    },
    updateDynamicRules
  };
}

describe("blocking", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "blocked-id"
    });
    makeBrowserMock();
  });

  it("normalizes blocked domains and rejects duplicates", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);

    const blocked = await settingsStore.addBlockedDomain("https://www.instagram.com/reels/", 1);
    expect(blocked.domain).toBe("instagram.com");

    await expect(settingsStore.addBlockedDomain("m.instagram.com", 2)).rejects.toThrow(
      "already blocked"
    );
  });

  it("edits blocked domains and rejects duplicate edits", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);

    const blocked = await settingsStore.addBlockedDomain("instagram.com", 1);
    await settingsStore.addBlockedDomain("reddit.com", 2);
    await settingsStore.updateBlockedDomain(
      blocked.id,
      "https://www.youtube.com/watch?v=123",
      { mode: "always" },
      3
    );

    const settings = await settingsStore.get(4);
    expect(settings.blockedDomains.find((row) => row.id === blocked.id)?.domain).toBe(
      "youtube.com"
    );

    await expect(
      settingsStore.updateBlockedDomain(blocked.id, "reddit.com", { mode: "always" }, 5)
    ).rejects.toThrow("already blocked");
  });

  it("matches normal subdomains through shared normalization", () => {
    const blockedDomains: BlockedDomain[] = [
      {
        id: "1",
        domain: "instagram.com",
        enabled: true,
        schedule: ALWAYS_SCHEDULE,
        createdAt: 1
      }
    ];

    expect(isDomainBlocked("www.instagram.com", blockedDomains)).toBe(true);
    expect(isDomainBlocked("m.instagram.com", blockedDomains)).toBe(true);
    expect(isDomainBlocked("instagram.com", blockedDomains)).toBe(true);
    expect(isDomainBlocked("example.com", blockedDomains)).toBe(false);
  });

  it("generates stable rule IDs and main-frame redirect rules", () => {
    expect(stableRuleIdForDomain("instagram.com")).toBe(stableRuleIdForDomain("instagram.com"));
    expect(buildDynamicBlockRule("instagram.com")).toMatchObject({
      id: stableRuleIdForDomain("instagram.com"),
      action: {
        type: "redirect"
      },
      condition: {
        urlFilter: "||instagram.com^",
        resourceTypes: ["main_frame"]
      }
    });
  });

  it("removing a block removes the corresponding dynamic rule", async () => {
    const browserMock = makeBrowserMock();
    const manager = new BlockRuleManager();
    const blockedDomains: BlockedDomain[] = [
      {
        id: "1",
        domain: "instagram.com",
        enabled: true,
        schedule: ALWAYS_SCHEDULE,
        createdAt: 1
      }
    ];

    await manager.syncDynamicRules(blockedDomains);
    expect(browserMock.rules).toHaveLength(1);

    await manager.syncDynamicRules([]);
    expect(browserMock.rules).toHaveLength(0);
  });

  it("keeps existing always-blocked rules active", async () => {
    const browserMock = makeBrowserMock();
    const manager = new BlockRuleManager();
    const blockedDomains: BlockedDomain[] = [
      {
        id: "1",
        domain: "instagram.com",
        enabled: true,
        schedule: ALWAYS_SCHEDULE,
        createdAt: 1
      }
    ];

    await manager.syncDynamicRules(blockedDomains, new Date(2026, 6, 12, 23).getTime());
    expect(browserMock.rules).toHaveLength(1);
  });

  it("activates and deactivates scheduled block rules", async () => {
    const browserMock = makeBrowserMock();
    const manager = new BlockRuleManager();
    const blockedDomains: BlockedDomain[] = [
      {
        id: "1",
        domain: "reddit.com",
        enabled: true,
        schedule: {
          mode: "custom",
          daysOfWeek: WEEKDAYS,
          startMinutes: 9 * 60,
          endMinutes: 17 * 60
        },
        createdAt: 1
      }
    ];

    await manager.syncDynamicRules(blockedDomains, new Date(2026, 6, 6, 10).getTime());
    expect(browserMock.rules).toHaveLength(1);

    await manager.syncDynamicRules(blockedDomains, new Date(2026, 6, 6, 18).getTime());
    expect(browserMock.rules).toHaveLength(0);
  });

  it("supports midnight-crossing scheduled block rules", async () => {
    const browserMock = makeBrowserMock();
    const manager = new BlockRuleManager();
    const blockedDomains: BlockedDomain[] = [
      {
        id: "1",
        domain: "reddit.com",
        enabled: true,
        schedule: {
          mode: "custom",
          daysOfWeek: [1],
          startMinutes: 22 * 60,
          endMinutes: 7 * 60
        },
        createdAt: 1
      }
    ];

    await manager.syncDynamicRules(blockedDomains, new Date(2026, 6, 6, 23).getTime());
    expect(browserMock.rules).toHaveLength(1);

    await manager.syncDynamicRules(blockedDomains, new Date(2026, 6, 7, 6).getTime());
    expect(browserMock.rules).toHaveLength(1);

    await manager.syncDynamicRules(blockedDomains, new Date(2026, 6, 7, 8).getTime());
    expect(browserMock.rules).toHaveLength(0);
  });

  it("does not let arbitrary blocked-page query parameters create fake attempts", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);
    await settingsStore.addBlockedDomain("instagram.com", 1);
    const attempts: BlockAttempt[] = [];
    const recorder = new BlockAttemptRecorder(
      settingsStore,
      {
        recordNavigationAttempt: vi.fn(async (domain: string, now: number) => {
          const attempt: BlockAttempt = {
            id: `${domain}::bucket`,
            domain,
            attemptedAt: now,
            dateKey: "1970-01-01",
            source: "navigation",
            count: 1
          };
          attempts.push(attempt);
          return attempt;
        }),
        countForDate: vi.fn(async () => 0)
      } as unknown as ConstructorParameters<typeof BlockAttemptRecorder>[1],
      () => 1
    );

    await expect(recorder.recordNavigationAttempt("evil.com")).rejects.toThrow();
    expect(attempts).toHaveLength(0);

    await recorder.recordNavigationAttempt("https://www.instagram.com/reels/");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].domain).toBe("instagram.com");
  });

  it("does not record attempts for scheduled blocks outside their active window", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);
    await settingsStore.addBlockedDomain("reddit.com", 1, {
      mode: "custom",
      daysOfWeek: [1],
      startMinutes: 9 * 60,
      endMinutes: 17 * 60
    });
    const recorder = new BlockAttemptRecorder(
      settingsStore,
      {
        recordNavigationAttempt: vi.fn(async () => {
          throw new Error("should not record");
        }),
        countForDate: vi.fn(async () => 0)
      } as unknown as ConstructorParameters<typeof BlockAttemptRecorder>[1],
      () => new Date(2026, 6, 6, 18).getTime()
    );

    await expect(recorder.recordNavigationAttempt("reddit.com")).rejects.toThrow(
      "not currently blocked"
    );
  });
});
