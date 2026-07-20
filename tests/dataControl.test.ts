import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataControlService } from "@/background/dataControl/DataControlService";
import { BlockAttemptRepository } from "@/db/repositories/BlockAttemptRepository";
import { DailyUsageRepository } from "@/db/repositories/DailyUsageRepository";
import { SessionRepository } from "@/db/repositories/SessionRepository";
import { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import { SettingsStore } from "@/storage/SettingsStore";
import { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import { MemoryStorageArea } from "./helpers/memoryStorage";
import type { UsageSession } from "@/shared/types";

const TEST_DATE_KEY = "2026-07-20";
const TEST_NOW = new Date(2026, 6, 20, 12, 0, 0).getTime();

function makeSession(
  id: string,
  domain: string,
  windowScope: "regular" | "private"
): UsageSession {
  return {
    id,
    domain,
    windowScope,
    startedAt: 1,
    endedAt: 61_000,
    durationMs: 60_000,
    startReason: "startup",
    endReason: "navigation",
    dateKey: TEST_DATE_KEY,
    createdAt: 61_000
  };
}

describe("private browsing data control", () => {
  beforeEach(() => {
    vi.stubGlobal("browser", {
      runtime: {
        getManifest: () => ({ version: "0.1.4" })
      }
    });
  });

  it("clears private data without deleting regular data or configured rules", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);
    const runtimeStateStore = new RuntimeStateStore(storage);
    const visionSettingsStore = new VisionSettingsStore(storage);
    const sessionRepository = new SessionRepository();
    const dailyUsageRepository = new DailyUsageRepository();
    const blockAttemptRepository = new BlockAttemptRepository();
    const service = new DataControlService({
      settingsStore,
      runtimeStateStore,
      visionSettingsStore,
      blockRuleManager: {
        refreshDynamicRules: vi.fn(async () => undefined)
      } as unknown as ConstructorParameters<typeof DataControlService>[0]["blockRuleManager"],
      timeLimitManager: {
        refresh: vi.fn(async () => undefined)
      } as unknown as ConstructorParameters<typeof DataControlService>[0]["timeLimitManager"],
      frictionRuleManager: {
        refreshDynamicRules: vi.fn(async () => undefined)
      } as unknown as ConstructorParameters<typeof DataControlService>[0]["frictionRuleManager"],
      trackingEngine: {
        reconcileTrackingState: vi.fn(async () => undefined)
      } as unknown as ConstructorParameters<typeof DataControlService>[0]["trackingEngine"],
      seedSiteCategoryCount: 0,
      storageArea: storage,
      now: () => 100
    });

    await settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);
    await settingsStore.addBlockedDomain("instagram.com", 2, { mode: "always" }, "regular");
    await settingsStore.addBlockedDomain("instagram.com", 3, { mode: "always" }, "private");
    await settingsStore.addTimeLimitedDomain("youtube.com", 30, 4, { mode: "always" }, "regular");
    await settingsStore.addTimeLimitedDomain("youtube.com", 30, 5, { mode: "always" }, "private");
    await sessionRepository.add(makeSession("regular-session", "github.com", "regular"));
    await sessionRepository.add(makeSession("private-session", "private.example", "private"));
    await dailyUsageRepository.addDuration(TEST_DATE_KEY, "github.com", 60_000, 1, 1, "regular");
    await dailyUsageRepository.addDuration(
      TEST_DATE_KEY,
      "private.example",
      60_000,
      1,
      1,
      "private"
    );
    await blockAttemptRepository.recordNavigationAttempt("instagram.com", TEST_NOW, "regular");
    await blockAttemptRepository.recordNavigationAttempt("instagram.com", TEST_NOW + 1, "private");

    await service.clearPrivateBrowsingData();

    const settings = await settingsStore.get(101);
    expect(settings.privateBrowserTrackingEnabled).toBe(false);
    expect(settings.blockedDomains).toHaveLength(2);
    expect(settings.timeLimitedDomains).toHaveLength(2);
    const remainingSessions = await sessionRepository.listAll();
    expect(remainingSessions.some((session) => session.id === "regular-session")).toBe(true);
    expect(remainingSessions.some((session) => session.id === "private-session")).toBe(false);
    expect(await dailyUsageRepository.listByDate(TEST_DATE_KEY, "regular")).toHaveLength(1);
    expect(await dailyUsageRepository.listByDate(TEST_DATE_KEY, "private")).toHaveLength(0);
    expect(await blockAttemptRepository.countForDate("instagram.com", TEST_DATE_KEY, "regular")).toBe(
      1
    );
    expect(await blockAttemptRepository.countForDate("instagram.com", TEST_DATE_KEY, "private")).toBe(
      0
    );
  });
});
