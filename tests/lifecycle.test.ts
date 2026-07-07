import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionLifecycleManager } from "@/background/lifecycle/ExtensionLifecycleManager";
import { LifecycleStore } from "@/storage/LifecycleStore";
import { SettingsStore } from "@/storage/SettingsStore";
import { LIFECYCLE_STORAGE_KEY, SETTINGS_STORAGE_KEY } from "@/shared/constants";
import { MemoryStorageArea } from "./helpers/memoryStorage";

describe("extension lifecycle and migrations", () => {
  beforeEach(() => {
    vi.stubGlobal("browser", {
      runtime: {
        id: "0wl@example.local",
        getManifest: () => ({ version: "0.2.0" })
      }
    });
  });

  it("records Firefox install and update metadata before bootstrapping", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const lifecycleStore = new LifecycleStore(storage);
    const bootstrap = vi.fn(async () => undefined);
    const manager = new ExtensionLifecycleManager({
      lifecycleStore,
      bootstrap,
      now: () => 10
    });

    await manager.handleInstalled({
      reason: "update",
      previousVersion: "0.1.0",
      temporary: false
    });

    const state = await lifecycleStore.get();
    expect(state).toMatchObject({
      extensionId: "0wl@example.local",
      installedVersion: "0.2.0",
      previousVersion: "0.1.0",
      lastInstallReason: "update",
      temporary: false,
      updatedAt: 10
    });
    expect(bootstrap).toHaveBeenCalledWith("installed");
  });

  it("repairs legacy settings and persists the current schema", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    await storage.set({
      [SETTINGS_STORAGE_KEY]: {
        schemaVersion: 1,
        trackingEnabled: true,
        idleThresholdSeconds: 60,
        blockedDomains: [
          { id: "blocked-1", domain: "www.instagram.com", enabled: true, createdAt: 1 }
        ],
        ignoredDomains: ["m.reddit.com"],
        showBlockedAttemptCount: true,
        createdAt: 1,
        updatedAt: 1
      }
    });

    const settingsStore = new SettingsStore(storage);
    const migration = await settingsStore.migrateStoredSettings(20);
    const persisted = (await storage.get(SETTINGS_STORAGE_KEY)) as Record<string, unknown>;

    expect(migration.changed).toBe(true);
    expect(migration.created).toBe(false);
    expect(migration.settings.blockedDomains[0]?.domain).toBe("instagram.com");
    expect(migration.settings.timeLimitedDomains).toEqual([]);
    expect(migration.settings.ignoredDomains).toEqual(["reddit.com"]);
    expect(persisted[SETTINGS_STORAGE_KEY]).toMatchObject({
      timeLimitedDomains: [],
      updatedAt: 20
    });
  });

  it("records migration metadata without storing browsing data", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const lifecycleStore = new LifecycleStore(storage);

    await lifecycleStore.recordMigration("0.2.0", 30);

    const persisted = (await storage.get(LIFECYCLE_STORAGE_KEY)) as Record<string, unknown>;
    expect(persisted[LIFECYCLE_STORAGE_KEY]).toMatchObject({
      installedVersion: "0.2.0",
      lastMigrationAt: 30,
      migrationRevision: 1
    });
  });
});
