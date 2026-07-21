import { describe, expect, it } from "vitest";
import { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import { RUNTIME_STATE_STORAGE_KEY } from "@/shared/constants";
import { MemoryStorageArea } from "./helpers/memoryStorage";

describe("runtime tracking state storage", () => {
  it("treats legacy tracking state without a window scope as regular", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    await storage.set({
      [RUNTIME_STATE_STORAGE_KEY]: {
        status: "tracking",
        activeTabId: 1,
        activeWindowId: 1,
        domain: "github.com",
        sessionStartedAt: 1_000,
        lastTransitionAt: 1_000,
        revision: 1
      }
    });

    const state = await new RuntimeStateStore(storage).get(2_000);

    expect(state.windowScope).toBe("regular");
  });

  it("keeps missing scope null for inactive legacy state", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    await storage.set({
      [RUNTIME_STATE_STORAGE_KEY]: {
        status: "inactive",
        activeTabId: null,
        activeWindowId: null,
        domain: null,
        sessionStartedAt: null,
        lastTransitionAt: 1_000,
        revision: 1
      }
    });

    const state = await new RuntimeStateStore(storage).get(2_000);

    expect(state.windowScope).toBeNull();
  });
});
