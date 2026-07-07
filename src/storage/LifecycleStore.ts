import { LIFECYCLE_STORAGE_KEY, createDefaultLifecycleState } from "./defaults";
import type { ExtensionInstallReason, ExtensionLifecycleState } from "@/shared/types";
import { isPlainObject } from "@/shared/validation";

type StorageArea = browser.storage.StorageArea;

interface InstallEventInput {
  extensionId: string | null;
  installedVersion: string;
  previousVersion: string | null;
  lastInstallReason: ExtensionInstallReason;
  temporary: boolean | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeLifecycleState(value: unknown): ExtensionLifecycleState | null {
  if (!isPlainObject(value)) {
    return null;
  }

  if (
    value.schemaVersion !== 1 ||
    !(typeof value.extensionId === "string" || value.extensionId === null) ||
    !(typeof value.installedVersion === "string" || value.installedVersion === null) ||
    !(typeof value.previousVersion === "string" || value.previousVersion === null) ||
    !(
      value.lastInstallReason === "install" ||
      value.lastInstallReason === "update" ||
      value.lastInstallReason === "browser_update" ||
      value.lastInstallReason === "unknown" ||
      value.lastInstallReason === null
    ) ||
    !(typeof value.temporary === "boolean" || value.temporary === null) ||
    !isFiniteNumber(value.installedAt) ||
    !isFiniteNumber(value.updatedAt) ||
    !(isFiniteNumber(value.lastMigrationAt) || value.lastMigrationAt === null) ||
    !isFiniteNumber(value.migrationRevision)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    extensionId: value.extensionId,
    installedVersion: value.installedVersion,
    previousVersion: value.previousVersion,
    lastInstallReason: value.lastInstallReason,
    temporary: value.temporary,
    installedAt: value.installedAt,
    updatedAt: value.updatedAt,
    lastMigrationAt: value.lastMigrationAt,
    migrationRevision: value.migrationRevision
  };
}

export class LifecycleStore {
  constructor(private readonly storageArea: StorageArea = browser.storage.local) {}

  async get(now = Date.now()): Promise<ExtensionLifecycleState> {
    const result = (await this.storageArea.get(LIFECYCLE_STORAGE_KEY)) as Record<string, unknown>;
    const value = result[LIFECYCLE_STORAGE_KEY];
    return normalizeLifecycleState(value) ?? createDefaultLifecycleState(now);
  }

  async recordInstallEvent(
    input: InstallEventInput,
    now = Date.now()
  ): Promise<ExtensionLifecycleState> {
    const current = await this.get(now);
    const next: ExtensionLifecycleState = {
      ...current,
      extensionId: input.extensionId,
      installedVersion: input.installedVersion,
      previousVersion: input.previousVersion,
      lastInstallReason: input.lastInstallReason,
      temporary: input.temporary,
      installedAt: current.installedVersion === null ? now : current.installedAt,
      updatedAt: now
    };

    await this.save(next);
    return next;
  }

  async recordMigration(
    installedVersion: string | null,
    now = Date.now()
  ): Promise<ExtensionLifecycleState> {
    const current = await this.get(now);
    const next: ExtensionLifecycleState = {
      ...current,
      installedVersion: installedVersion ?? current.installedVersion,
      lastMigrationAt: now,
      migrationRevision: current.migrationRevision + 1,
      updatedAt: now
    };

    await this.save(next);
    return next;
  }

  async save(state: ExtensionLifecycleState): Promise<void> {
    await this.storageArea.set({ [LIFECYCLE_STORAGE_KEY]: state });
  }
}
