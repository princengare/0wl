import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { ExtensionLifecycleManager } from "@/background/lifecycle/ExtensionLifecycleManager";
import { runMigrations } from "@/db/migrations";
import { SessionRepository } from "@/db/repositories/SessionRepository";
import { LifecycleStore } from "@/storage/LifecycleStore";
import { SettingsStore } from "@/storage/SettingsStore";
import { LIFECYCLE_STORAGE_KEY, SETTINGS_STORAGE_KEY } from "@/shared/constants";
import type { UsageSession } from "@/shared/types";
import { MemoryStorageArea } from "./helpers/memoryStorage";

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listSourceFiles(path) : Promise.resolve([path]);
    })
  );

  return files.flat().filter((path) => /\.(ts|tsx)$/.test(path));
}

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
        timeLimitedDomains: [
          {
            id: "limit-1",
            domain: "www.youtube.com",
            enabled: true,
            limitMinutes: 30,
            createdAt: 2,
            bypassUntil: null
          }
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
    expect(migration.settings.blockedDomains[0]?.windowScope).toBe("regular");
    expect(migration.settings.blockedDomains[0]?.schedule).toEqual({ mode: "always" });
    expect(migration.settings.timeLimitedDomains[0]).toMatchObject({
      domain: "youtube.com",
      targetType: "domain",
      windowScope: "regular",
      schedule: { mode: "always" }
    });
    expect(migration.settings.privateBrowserTrackingEnabled).toBe(false);
    expect(migration.settings.ignoredDomains).toEqual(["reddit.com"]);
    expect(persisted[SETTINGS_STORAGE_KEY]).toMatchObject({
      updatedAt: 20
    });
  });

  it("persists the private browser tracking setting", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const settingsStore = new SettingsStore(storage);

    await settingsStore.get(10);
    const updated = await settingsStore.update({ privateBrowserTrackingEnabled: true }, 20);
    const reloaded = await settingsStore.get(30);

    expect(updated.privateBrowserTrackingEnabled).toBe(true);
    expect(reloaded.privateBrowserTrackingEnabled).toBe(true);
  });

  it("does not contain runtime code that clears extension persistence", async () => {
    const sourceFiles = await listSourceFiles(join(process.cwd(), "src"));
    const contents = await Promise.all(sourceFiles.map((path) => readFile(path, "utf8")));
    const source = contents.join("\n");

    expect(source).not.toContain("browser.storage.local.clear(");
    expect(source).not.toContain("indexedDB.deleteDatabase(");
    expect(source).not.toContain("deleteObjectStore(");
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

  it("runs IndexedDB migrations without deleting existing sessions", async () => {
    const sessionRepository = new SessionRepository();
    const id = `preserved-session-${Date.now()}`;
    const session: UsageSession = {
      id,
      domain: "github.com",
      startedAt: 1,
      endedAt: 61_000,
      durationMs: 60_000,
      startReason: "startup",
      endReason: "navigation",
      dateKey: "1970-01-01",
      createdAt: 61_000
    };

    await sessionRepository.add(session);
    await runMigrations();

    expect(await sessionRepository.getByDateKey("1970-01-01")).toContainEqual({
      ...session,
      windowScope: "regular",
      usageMode: "active"
    });
  });
});
