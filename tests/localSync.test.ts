import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDeviceSyncService } from "@/sync/LocalDeviceSyncService";
import { SessionRepository } from "@/db/repositories/SessionRepository";
import { DailyUsageRepository } from "@/db/repositories/DailyUsageRepository";
import { SettingsStore } from "@/storage/SettingsStore";
import { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import { MemoryStorageArea } from "./helpers/memoryStorage";
import type { SyncBundle, UsageSession } from "@/shared/types";

const NOW = new Date(2026, 6, 23, 12, 0, 0).getTime();
const DATE_KEY = "2026-07-23";

function makeBrowserMock(): void {
  vi.stubGlobal("browser", {
    runtime: {
      id: "local-test-extension",
      getManifest: () => ({ version: "0.1.9" })
    }
  });
}

function makeSession(id: string, domain: string, startedAt: number): UsageSession {
  return {
    id,
    domain,
    windowScope: "regular",
    usageMode: "active",
    startedAt,
    endedAt: startedAt + 10 * 60 * 1000,
    durationMs: 10 * 60 * 1000,
    startReason: "startup",
    endReason: "navigation",
    dateKey: DATE_KEY,
    createdAt: startedAt + 10 * 60 * 1000
  };
}

function createService(storage: browser.storage.StorageArea): LocalDeviceSyncService {
  const settingsStore = new SettingsStore(storage);
  const visionSettingsStore = new VisionSettingsStore(storage);

  return new LocalDeviceSyncService({
    settingsStore,
    visionSettingsStore,
    blockRuleManager: {
      refreshDynamicRules: vi.fn(async () => undefined)
    } as unknown as ConstructorParameters<typeof LocalDeviceSyncService>[0]["blockRuleManager"],
    timeLimitManager: {
      refresh: vi.fn(async () => undefined)
    } as unknown as ConstructorParameters<typeof LocalDeviceSyncService>[0]["timeLimitManager"],
    scheduledBreakManager: {
      refresh: vi.fn(async () => undefined)
    } as unknown as ConstructorParameters<
      typeof LocalDeviceSyncService
    >[0]["scheduledBreakManager"],
    frictionRuleManager: {
      refreshDynamicRules: vi.fn(async () => undefined)
    } as unknown as ConstructorParameters<typeof LocalDeviceSyncService>[0]["frictionRuleManager"],
    storageArea: storage,
    now: () => NOW
  });
}

describe("local device sync", () => {
  beforeEach(() => {
    makeBrowserMock();
  });

  it("exports regular data and excludes private raw history by default", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);
    const sessionRepository = new SessionRepository();
    const dailyUsageRepository = new DailyUsageRepository();
    const service = createService(storage);

    await settingsStore.addBlockedDomain("instagram.com", 1, { mode: "always" }, "regular");
    await settingsStore.addBlockedDomain("private.example", 2, { mode: "always" }, "private");
    await sessionRepository.add(makeSession("regular-session", "github.com", NOW - 60_000));
    await sessionRepository.add({
      ...makeSession("private-session", "private.example", NOW - 60_000),
      windowScope: "private"
    });
    await dailyUsageRepository.addDuration(DATE_KEY, "private.example", 60_000, 1, 1, "private");

    const result = await service.exportBundle(false);

    expect(result.fileName).toContain("0wl-sync");
    expect(result.bundle.version).toBe("0.1.9");
    expect(result.bundle.includesPrivateData).toBe(false);
    expect(result.bundle.data.sessions.map((session) => session.id)).toEqual(["regular-session"]);
    expect(result.bundle.data.dailyUsage.some((row) => row.windowScope === "private")).toBe(false);
    expect(result.bundle.data.blockedSites.map((rule) => rule.domain)).toEqual(["instagram.com"]);
  });

  it("records source extension IDs and reports local export/import sync diagnostics", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const service = createService(storage);
    const exported = await service.exportBundle(false);
    const afterExport = await service.getDiagnostics();

    expect(exported.bundle.sourceExtensionId).toBe("local-test-extension");
    expect(afterExport).toMatchObject({
      extensionId: "local-test-extension",
      syncMethod: "export-import",
      exportAvailable: true,
      importPreviewAvailable: true,
      duplicatePrevention: "enabled",
      conflictReview: "enabled",
      privateDataDefaultExcluded: true,
      lastExportAt: NOW,
      lastImportAt: null
    });
    expect(afterExport.limitations.join(" ")).toContain("export/import");

    const preview = await service.previewImport({
      ...exported.bundle,
      sourceBrowser: "chrome",
      sourceExtensionId: "chrome-extension-id"
    });

    expect(preview).toMatchObject({
      sourceBrowser: "chrome",
      sourceExtensionId: "chrome-extension-id"
    });

    await service.applyImport(
      {
        ...exported.bundle,
        sourceBrowser: "chrome",
        sourceExtensionId: "chrome-extension-id"
      },
      "keep-current"
    );

    expect(await service.getDiagnostics()).toMatchObject({
      lastImportAt: NOW,
      lastImportSourceBrowser: "chrome",
      lastImportSourceExtensionId: "chrome-extension-id"
    });
  });

  it("includes private aggregate data only when explicitly selected", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);
    const sessionRepository = new SessionRepository();
    const dailyUsageRepository = new DailyUsageRepository();
    const service = createService(storage);

    await settingsStore.addBlockedDomain("private.example", 1, { mode: "always" }, "private");
    await sessionRepository.add({
      ...makeSession("private-raw-session", "private.example", NOW - 60_000),
      windowScope: "private"
    });
    await dailyUsageRepository.addDuration(DATE_KEY, "private.example", 60_000, 1, 1, "private");

    const result = await service.exportBundle(true);

    expect(result.bundle.includesPrivateData).toBe(true);
    expect(result.bundle.data.sessions.some((session) => session.windowScope === "private")).toBe(
      false
    );
    expect(result.bundle.data.dailyUsage.some((row) => row.windowScope === "private")).toBe(true);
    expect(result.bundle.data.blockedSites.some((rule) => rule.windowScope === "private")).toBe(
      true
    );
  });

  it("rejects invalid sync bundles before preview or apply", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const service = createService(storage);

    await expect(service.previewImport({ app: "not-0wl" })).rejects.toThrow(
      "Choose a valid 0wl sync bundle."
    );
    await expect(service.applyImport({ app: "not-0wl" }, "keep-current")).rejects.toThrow(
      "Choose a valid 0wl sync bundle."
    );
  });

  it("ignores private rows from imports that do not declare private data", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);
    const dailyUsageRepository = new DailyUsageRepository();
    const service = createService(storage);
    const privateImportDateKey = "2026-07-24";

    await service.applyImport(
      {
        app: "0wl",
        schemaVersion: 1,
        exportedAt: NOW,
        version: "0.1.9",
        sourceBrowser: "firefox",
        includesPrivateData: false,
        data: {
          sessions: [],
          dailyUsage: [
            {
              id: `${privateImportDateKey}::private::private.example`,
              dateKey: privateImportDateKey,
              domain: "private.example",
              windowScope: "private",
              durationMs: 60_000,
              sessionCount: 1,
              lastUpdatedAt: NOW
            }
          ],
          blockAttempts: [],
          blockedSites: [
            {
              id: "private-block",
              domain: "private.example",
              windowScope: "private",
              enabled: true,
              schedule: { mode: "always" },
              createdAt: NOW
            }
          ],
          timeLimits: [],
          scheduledBreakRules: [],
          frictionRules: [],
          visionSettings: null,
          siteCategories: []
        }
      },
      "use-imported"
    );

    expect((await settingsStore.get()).blockedDomains).toHaveLength(0);
    expect(await dailyUsageRepository.listByDate(privateImportDateKey, "private")).toHaveLength(0);
  });

  it("previews imports without applying data and skips duplicate sessions", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const sessionRepository = new SessionRepository();
    const service = createService(storage);
    const existing = makeSession("preview-existing", "github.com", NOW - 60 * 60 * 1000);
    const before = await sessionRepository.listAll();
    await sessionRepository.add(existing);

    const bundle: SyncBundle = {
      app: "0wl",
      schemaVersion: 1,
      exportedAt: NOW,
      version: "0.1.9",
      sourceBrowser: "firefox",
      includesPrivateData: false,
      data: {
        sessions: [
          existing,
          makeSession("preview-new-session", "youtube.com", NOW - 30 * 60 * 1000)
        ],
        dailyUsage: [],
        blockAttempts: [],
        blockedSites: [],
        timeLimits: [],
        scheduledBreakRules: [],
        frictionRules: [],
        visionSettings: null,
        siteCategories: []
      }
    };

    const preview = await service.previewImport(bundle);

    expect(preview.sessionsToAdd).toBe(1);
    expect(preview.duplicateSessionsSkipped).toBe(1);
    expect(await sessionRepository.listAll()).toHaveLength(before.length + 1);
  });

  it("detects blocked-site conflicts and applies imported resolution only after apply", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);
    const service = createService(storage);
    await settingsStore.addBlockedDomain("instagram.com", 1, { mode: "always" }, "regular");
    const bundle: SyncBundle = {
      app: "0wl",
      schemaVersion: 1,
      exportedAt: NOW,
      version: "0.1.9",
      sourceBrowser: "chrome",
      includesPrivateData: false,
      data: {
        sessions: [],
        dailyUsage: [],
        blockAttempts: [],
        blockedSites: [
          {
            id: "imported-block",
            domain: "instagram.com",
            windowScope: "regular",
            enabled: false,
            schedule: { mode: "always" },
            createdAt: 2
          }
        ],
        timeLimits: [],
        scheduledBreakRules: [],
        frictionRules: [],
        visionSettings: null,
        siteCategories: []
      }
    };

    const preview = await service.previewImport(bundle);
    expect(preview.conflicts).toHaveLength(1);
    expect((await settingsStore.get()).blockedDomains[0]?.enabled).toBe(true);

    await service.applyImport(bundle, "use-imported");
    expect((await settingsStore.get()).blockedDomains[0]).toMatchObject({
      domain: "instagram.com",
      enabled: false
    });
  });

  it("rebuilds daily usage from merged sessions to avoid double-counted aggregates", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const sessionRepository = new SessionRepository();
    const dailyUsageRepository = new DailyUsageRepository();
    const service = createService(storage);
    await sessionRepository.add(
      makeSession("rebuild-existing", "github.com", NOW - 60 * 60 * 1000)
    );
    await dailyUsageRepository.addDuration(DATE_KEY, "github.com", 99 * 60 * 1000, 99, 1);

    await service.applyImport(
      {
        app: "0wl",
        schemaVersion: 1,
        exportedAt: NOW,
        version: "0.1.9",
        sourceBrowser: "firefox",
        includesPrivateData: false,
        data: {
          sessions: [makeSession("rebuild-imported", "github.com", NOW - 30 * 60 * 1000)],
          dailyUsage: [
            {
              id: `${DATE_KEY}::github.com`,
              dateKey: DATE_KEY,
              domain: "github.com",
              windowScope: "regular",
              durationMs: 300 * 60 * 1000,
              sessionCount: 300,
              lastUpdatedAt: NOW
            }
          ],
          blockAttempts: [],
          blockedSites: [],
          timeLimits: [],
          scheduledBreakRules: [],
          frictionRules: [],
          visionSettings: null,
          siteCategories: []
        }
      },
      "keep-current"
    );

    const rows = await dailyUsageRepository.listByDate(DATE_KEY, "regular");
    const github = rows.find((row) => row.domain === "github.com");
    expect(github).toMatchObject({
      domain: "github.com",
      durationMs: expect.any(Number),
      sessionCount: expect.any(Number)
    });
    expect(github?.durationMs).toBeGreaterThanOrEqual(20 * 60 * 1000);
  });
});
