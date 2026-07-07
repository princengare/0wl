import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockAttemptRecorder } from "@/background/blocking/BlockAttemptRecorder";
import { BlockRuleManager } from "@/background/blocking/BlockRuleManager";
import { isDomainBlocked } from "@/background/blocking/BlockedDomainMatcher";
import {
  buildDynamicBlockRule,
  stableRuleIdForDomain
} from "@/background/blocking/DynamicRuleBuilder";
import { SettingsStore } from "@/storage/SettingsStore";
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

  it("matches normal subdomains through shared normalization", () => {
    const blockedDomains: BlockedDomain[] = [
      { id: "1", domain: "instagram.com", enabled: true, createdAt: 1 }
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
      { id: "1", domain: "instagram.com", enabled: true, createdAt: 1 }
    ];

    await manager.syncDynamicRules(blockedDomains);
    expect(browserMock.rules).toHaveLength(1);

    await manager.syncDynamicRules([]);
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
});
