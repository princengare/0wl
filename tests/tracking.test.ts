import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveContextResolver } from "@/background/tracking/ActiveContextResolver";
import { SessionManager } from "@/background/tracking/SessionManager";
import { TrackingEngine } from "@/background/tracking/TrackingEngine";
import { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import { SettingsStore } from "@/storage/SettingsStore";
import { MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS } from "@/shared/constants";
import type { ActiveBrowserContext, UsageSession } from "@/shared/types";
import { MemoryStorageArea } from "./helpers/memoryStorage";

class MutableContextResolver extends ActiveContextResolver {
  constructor(private readonly getContext: () => ActiveBrowserContext) {
    super();
  }

  override async resolve(): Promise<ActiveBrowserContext> {
    return this.getContext();
  }
}

function makeContext(
  domain: string | null,
  overrides: Partial<ActiveBrowserContext> = {}
): ActiveBrowserContext {
  return {
    browserFocused: true,
    idleState: "active",
    activeTabId: 1,
    activeWindowId: 1,
    url: domain ? `https://${domain}/` : "about:preferences",
    domain,
    trackable: Boolean(domain),
    ...overrides
  };
}

function createHarness() {
  const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
  const settingsStore = new SettingsStore(storage);
  const runtimeStateStore = new RuntimeStateStore(storage);
  const sessions: UsageSession[] = [];
  const dailySessions: UsageSession[] = [];
  let now = 1_000;
  let context = makeContext("youtube.com");
  const resolver = new MutableContextResolver(() => context);
  const sessionManager = new SessionManager(
    {
      add: vi.fn(async (session: UsageSession) => {
        sessions.push(session);
      })
    } as unknown as ConstructorParameters<typeof SessionManager>[0],
    {
      addSession: vi.fn(async (session: UsageSession) => {
        dailySessions.push(session);
      })
    } as unknown as ConstructorParameters<typeof SessionManager>[1]
  );
  const engine = new TrackingEngine({
    settingsStore,
    runtimeStateStore,
    activeContextResolver: resolver,
    sessionManager,
    now: () => now
  });

  return {
    engine,
    settingsStore,
    runtimeStateStore,
    sessions,
    dailySessions,
    setNow: (next: number) => {
      now = next;
    },
    setContext: (next: ActiveBrowserContext) => {
      context = next;
    }
  };
}

describe("tracking state machine", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "session-id"
    });
  });

  it("moves inactive to tracking", async () => {
    const harness = createHarness();

    await harness.engine.reconcileTrackingState("startup");

    const state = await harness.runtimeStateStore.get();
    expect(state.status).toBe("tracking");
    expect(state.domain).toBe("youtube.com");
    expect(state.sessionStartedAt).toBe(1_000);
  });

  it("does not track private windows while private tracking is disabled", async () => {
    const harness = createHarness();
    harness.setContext(makeContext("youtube.com", { windowScope: "private" }));

    await harness.engine.reconcileTrackingState("startup");

    const state = await harness.runtimeStateStore.get();
    expect(state.status).toBe("inactive");
    expect(harness.sessions).toHaveLength(0);
  });

  it("tracks private windows when private tracking is enabled", async () => {
    const harness = createHarness();
    await harness.settingsStore.update({ privateBrowserTrackingEnabled: true }, 900);
    harness.setContext(makeContext("youtube.com", { windowScope: "private" }));

    await harness.engine.reconcileTrackingState("startup");

    const state = await harness.runtimeStateStore.get();
    expect(state.status).toBe("tracking");
    expect(state.windowScope).toBe("private");

    harness.setNow(3_000);
    harness.setContext(makeContext("youtube.com", { windowScope: "private", idleState: "idle" }));
    await harness.engine.reconcileTrackingState("idle");

    expect(harness.sessions[0]).toMatchObject({
      domain: "youtube.com",
      windowScope: "private"
    });
  });

  it("stops private active browsing when the browser is unfocused", async () => {
    const harness = createHarness();
    await harness.settingsStore.update({ privateBrowserTrackingEnabled: true }, 900);
    harness.setContext(makeContext("youtube.com", { windowScope: "private" }));
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(4_000);
    harness.setContext(
      makeContext("youtube.com", { browserFocused: false, windowScope: "private" })
    );
    await harness.engine.reconcileTrackingState("window-blurred");

    expect(harness.sessions[0]).toMatchObject({
      domain: "youtube.com",
      windowScope: "private",
      endReason: "window-blurred"
    });
    expect((await harness.runtimeStateStore.get()).status).toBe("browser-unfocused");
  });

  it("closes domain A and starts domain B at the same transition timestamp", async () => {
    const harness = createHarness();
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(7_000);
    harness.setContext(makeContext("github.com"));
    await harness.engine.reconcileTrackingState("navigation");

    expect(harness.sessions).toHaveLength(1);
    expect(harness.sessions[0]).toMatchObject({
      domain: "youtube.com",
      startedAt: 1_000,
      endedAt: 7_000,
      durationMs: 6_000,
      endReason: "navigation"
    });
    expect((await harness.runtimeStateStore.get()).domain).toBe("github.com");
    expect((await harness.runtimeStateStore.get()).sessionStartedAt).toBe(7_000);
  });

  it("keeps navigation within the same normalized domain as one session", async () => {
    const harness = createHarness();
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(5_000);
    harness.setContext(makeContext("youtube.com", { url: "https://youtube.com/watch?v=123" }));
    await harness.engine.reconcileTrackingState("navigation");

    expect(harness.sessions).toHaveLength(0);
    expect((await harness.runtimeStateStore.get()).sessionStartedAt).toBe(1_000);
  });

  it("stops on idle and resumes from active time", async () => {
    const harness = createHarness();
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(3_000);
    harness.setContext(makeContext("youtube.com", { idleState: "idle" }));
    await harness.engine.reconcileTrackingState("idle");

    expect(harness.sessions).toHaveLength(1);
    expect((await harness.runtimeStateStore.get()).status).toBe("idle");

    harness.setNow(9_000);
    harness.setContext(makeContext("youtube.com", { idleState: "active" }));
    await harness.engine.reconcileTrackingState("idle-resumed");

    const state = await harness.runtimeStateStore.get();
    expect(state.status).toBe("tracking");
    expect(state.sessionStartedAt).toBe(9_000);
  });

  it("stops on browser blur and resumes as a new session on focus", async () => {
    const harness = createHarness();
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(4_000);
    harness.setContext(makeContext("github.com", { browserFocused: false }));
    await harness.engine.reconcileTrackingState("window-blurred");

    expect(harness.sessions[0]).toMatchObject({
      domain: "youtube.com",
      endReason: "window-blurred"
    });
    expect((await harness.runtimeStateStore.get()).status).toBe("browser-unfocused");

    harness.setNow(8_000);
    harness.setContext(makeContext("github.com", { browserFocused: true }));
    await harness.engine.reconcileTrackingState("window-focused");

    expect((await harness.runtimeStateStore.get()).sessionStartedAt).toBe(8_000);
  });

  it("closes the active session when tracking is disabled", async () => {
    const harness = createHarness();
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(2_000);
    await harness.settingsStore.update({ trackingEnabled: false }, 2_000);
    await harness.engine.reconcileTrackingState("tracking-disabled");

    expect(harness.sessions[0]).toMatchObject({
      domain: "youtube.com",
      endReason: "tracking-disabled"
    });
    expect((await harness.runtimeStateStore.get()).status).toBe("disabled");
  });

  it("does not count stale startup downtime", async () => {
    const harness = createHarness();
    await harness.runtimeStateStore.set({
      status: "tracking",
      activeTabId: 1,
      activeWindowId: 1,
      domain: "youtube.com",
      sessionStartedAt: 1_000,
      lastTransitionAt: 1_000,
      revision: 1
    });
    await harness.runtimeStateStore.setSessionStartReason("startup");

    harness.setNow(100_000);
    harness.setContext(makeContext("youtube.com"));
    await harness.engine.bootstrap("startup");

    expect(harness.sessions).toHaveLength(0);
    const state = await harness.runtimeStateStore.get();
    expect(state.status).toBe("tracking");
    expect(state.sessionStartedAt).toBe(100_000);
  });

  it("does not persist a stale 24-hour active session when a transition closes it", async () => {
    const harness = createHarness();
    await harness.runtimeStateStore.set({
      status: "tracking",
      activeTabId: 1,
      activeWindowId: 1,
      domain: "youtube.com",
      windowScope: "private",
      sessionStartedAt: 1_000,
      lastTransitionAt: 1_000,
      revision: 1
    });
    await harness.runtimeStateStore.setSessionStartReason("startup");
    await harness.settingsStore.update({ privateBrowserTrackingEnabled: true }, 1);

    harness.setNow(1_000 + MAX_REASONABLE_ACTIVE_SESSION_DURATION_MS + 1);
    harness.setContext(makeContext(null, { windowScope: "private" }));
    await harness.engine.reconcileTrackingState("navigation");

    expect(harness.sessions).toHaveLength(0);
    expect((await harness.runtimeStateStore.get()).status).toBe("inactive");
  });

  it("can stop tracking for a redirected active tab without waiting for navigation events", async () => {
    const harness = createHarness();
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(5_000);
    await harness.engine.stopTrackingForTab(1, "navigation");

    expect(harness.sessions).toHaveLength(1);
    expect(harness.sessions[0]).toMatchObject({
      domain: "youtube.com",
      endedAt: 5_000,
      endReason: "navigation"
    });
    expect((await harness.runtimeStateStore.get()).status).toBe("inactive");
  });

  it("does not count stale install or update downtime", async () => {
    const harness = createHarness();
    await harness.runtimeStateStore.set({
      status: "tracking",
      activeTabId: 1,
      activeWindowId: 1,
      domain: "youtube.com",
      sessionStartedAt: 1_000,
      lastTransitionAt: 1_000,
      revision: 1
    });
    await harness.runtimeStateStore.setSessionStartReason("startup");

    harness.setNow(120_000);
    harness.setContext(makeContext("youtube.com"));
    await harness.engine.bootstrap("installed");

    expect(harness.sessions).toHaveLength(0);
    const state = await harness.runtimeStateStore.get();
    expect(state.status).toBe("tracking");
    expect(state.sessionStartedAt).toBe(120_000);
  });

  it("serializes duplicate reconcile calls without overlapping sessions", async () => {
    const harness = createHarness();
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(5_000);
    harness.setContext(makeContext("github.com"));
    await Promise.all([
      harness.engine.reconcileTrackingState("navigation"),
      harness.engine.reconcileTrackingState("navigation")
    ]);

    expect(harness.sessions).toHaveLength(1);
    expect(harness.sessions[0].domain).toBe("youtube.com");
    expect((await harness.runtimeStateStore.get()).domain).toBe("github.com");
  });

  it("does not double-close when tab and window events arrive together", async () => {
    const harness = createHarness();
    await harness.engine.reconcileTrackingState("startup");

    harness.setNow(5_000);
    harness.setContext(makeContext("youtube.com", { browserFocused: false }));
    await Promise.all([
      harness.engine.reconcileTrackingState("window-blurred"),
      harness.engine.reconcileTrackingState("tab-activated")
    ]);

    expect(harness.sessions).toHaveLength(1);
    expect((await harness.runtimeStateStore.get()).status).toBe("browser-unfocused");
  });
});
