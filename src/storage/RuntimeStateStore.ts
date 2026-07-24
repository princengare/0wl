import {
  RUNTIME_SESSION_META_STORAGE_KEY,
  RUNTIME_STATE_STORAGE_KEY,
  createDefaultRuntimeSessionMeta,
  createDefaultRuntimeState
} from "./defaults";
import { browser as extensionBrowser } from "@/shared/browser";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { PersistedTrackingState, RuntimeSessionMeta, StartReason } from "@/shared/types";
import { isPlainObject } from "@/shared/validation";

type StorageArea = browser.storage.StorageArea;

function isPersistedTrackingState(value: unknown): value is PersistedTrackingState {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.status === "string" &&
    ["tracking", "inactive", "idle", "browser-unfocused", "disabled"].includes(value.status) &&
    (typeof value.activeTabId === "number" || value.activeTabId === null) &&
    (typeof value.activeWindowId === "number" || value.activeWindowId === null) &&
    (typeof value.domain === "string" || value.domain === null) &&
    (value.windowScope === "regular" ||
      value.windowScope === "private" ||
      value.windowScope === null ||
      value.windowScope === undefined) &&
    (typeof value.sessionStartedAt === "number" || value.sessionStartedAt === null) &&
    typeof value.lastTransitionAt === "number" &&
    typeof value.revision === "number"
  );
}

function isRuntimeSessionMeta(value: unknown): value is RuntimeSessionMeta {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    value.startReason === null ||
    value.startReason === "startup" ||
    value.startReason === "tab-activated" ||
    value.startReason === "navigation" ||
    value.startReason === "window-focused" ||
    value.startReason === "idle-resumed"
  );
}

function normalizeRuntimeWindowScope(
  value: PersistedTrackingState["windowScope"],
  status: PersistedTrackingState["status"]
): PersistedTrackingState["windowScope"] {
  if (value === "regular" || value === "private") {
    return normalizeWindowScope(value);
  }

  return status === "tracking" ? "regular" : null;
}

export class RuntimeStateStore {
  constructor(private readonly storageArea: StorageArea = extensionBrowser.storage.local) {}

  async get(now = Date.now()): Promise<PersistedTrackingState> {
    const result = (await this.storageArea.get(RUNTIME_STATE_STORAGE_KEY)) as Record<
      string,
      unknown
    >;
    const value = result[RUNTIME_STATE_STORAGE_KEY];
    return isPersistedTrackingState(value)
      ? {
          ...value,
          windowScope: normalizeRuntimeWindowScope(value.windowScope, value.status)
        }
      : createDefaultRuntimeState(now);
  }

  async set(state: PersistedTrackingState): Promise<void> {
    await this.storageArea.set({ [RUNTIME_STATE_STORAGE_KEY]: state });
  }

  async resetInactive(now = Date.now()): Promise<PersistedTrackingState> {
    const current = await this.get(now);
    const next: PersistedTrackingState = {
      ...createDefaultRuntimeState(now),
      revision: current.revision + 1
    };
    await this.set(next);
    await this.setSessionStartReason(null);
    return next;
  }

  async getSessionStartReason(): Promise<StartReason | null> {
    const result = (await this.storageArea.get(RUNTIME_SESSION_META_STORAGE_KEY)) as Record<
      string,
      unknown
    >;
    const value = result[RUNTIME_SESSION_META_STORAGE_KEY];
    return isRuntimeSessionMeta(value) ? value.startReason : null;
  }

  async setSessionStartReason(startReason: StartReason | null): Promise<void> {
    const meta = createDefaultRuntimeSessionMeta();
    meta.startReason = startReason;
    await this.storageArea.set({ [RUNTIME_SESSION_META_STORAGE_KEY]: meta });
  }
}
