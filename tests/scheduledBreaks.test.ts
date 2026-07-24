import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduledBreakManager } from "@/background/breaks/ScheduledBreakManager";
import { SessionRepository } from "@/db/repositories/SessionRepository";
import { RuntimeStateStore } from "@/storage/RuntimeStateStore";
import { SettingsStore } from "@/storage/SettingsStore";
import { SETTINGS_STORAGE_KEY } from "@/storage/defaults";
import { MemoryStorageArea } from "./helpers/memoryStorage";
import type { ScheduleConfig, UsageSession } from "@/shared/types";
import {
  BREAK_THRESHOLD_DURATION_MINUTES,
  TIME_LIMIT_DURATION_MINUTES
} from "@/shared/durationOptions";

const NOW = new Date(2026, 6, 23, 12, 0, 0).getTime();
const DATE_KEY = "2026-07-23";
const THURSDAY = 4;

function makeBrowserMock(tabs: browser.tabs.Tab[] = []) {
  const tabsUpdate = vi.fn(async () => ({}));

  vi.stubGlobal("browser", {
    runtime: {
      getURL: (path: string) => `moz-extension://extension-id/${path}`
    },
    alarms: {
      clear: vi.fn(async () => true),
      create: vi.fn(),
      onAlarm: {
        addListener: vi.fn()
      }
    },
    tabs: {
      query: vi.fn(async () => tabs),
      update: tabsUpdate
    }
  });

  return { tabsUpdate };
}

function makeTab(overrides: Partial<browser.tabs.Tab>): browser.tabs.Tab {
  return {
    id: 1,
    index: 0,
    highlighted: false,
    active: true,
    pinned: false,
    incognito: false,
    ...overrides
  };
}

function createManager(now = NOW, tabs: browser.tabs.Tab[] = []) {
  const browserMock = makeBrowserMock(tabs);
  const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
  const settingsStore = new SettingsStore(storage);
  const runtimeStateStore = new RuntimeStateStore(storage);
  const sessionRepository = new SessionRepository();
  const trackingEngine = {
    stopTrackingForTab: vi.fn(async () => undefined)
  };
  const manager = new ScheduledBreakManager({
    settingsStore,
    runtimeStateStore,
    sessionRepository,
    trackingEngine,
    storageArea: storage,
    now: () => now
  });

  return {
    ...browserMock,
    storage,
    manager,
    settingsStore,
    runtimeStateStore,
    sessionRepository,
    trackingEngine
  };
}

function makeSession(startedAt: number, endedAt: number): UsageSession {
  return {
    id: `session-${startedAt}`,
    domain: "github.com",
    windowScope: "regular",
    usageMode: "active",
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    startReason: "startup",
    endReason: "navigation",
    dateKey: DATE_KEY,
    createdAt: endedAt
  };
}

describe("scheduled browser breaks", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "break-rule-id"
    });
  });

  it("is disabled by default", async () => {
    const { manager } = createManager();

    expect(await manager.getStatus()).toMatchObject({
      visible: false,
      dndEnabled: false,
      breakActive: false,
      ruleCount: 0
    });
  });

  it("creates a scheduled break rule with a 5 minute break duration", async () => {
    const { settingsStore } = createManager();

    const rule = await settingsStore.addScheduledBreakRule(45, NOW);

    expect(rule).toMatchObject({
      enabled: true,
      windowScope: "regular",
      breakAfterMinutes: 45,
      breakDurationMinutes: 5,
      schedule: { mode: "always" }
    });
  });

  it("uses the same threshold options as normal time limits", () => {
    expect(BREAK_THRESHOLD_DURATION_MINUTES).toBe(TIME_LIMIT_DURATION_MINUTES);
    expect([...BREAK_THRESHOLD_DURATION_MINUTES]).toEqual([...TIME_LIMIT_DURATION_MINUTES]);
  });

  it("accepts configurable break durations from 1 minute through 1 hour", async () => {
    const { settingsStore } = createManager();

    const oneMinute = await settingsStore.addScheduledBreakRule(
      45,
      NOW,
      { mode: "always" },
      "regular",
      1
    );
    const oneHour = await settingsStore.addScheduledBreakRule(
      45,
      NOW,
      { mode: "always" },
      "private",
      60
    );

    expect(oneMinute.breakDurationMinutes).toBe(1);
    expect(oneHour.breakDurationMinutes).toBe(60);
  });

  it("rejects break durations outside the supported 1 minute to 1 hour range", async () => {
    const { settingsStore } = createManager();

    await expect(
      settingsStore.addScheduledBreakRule(45, NOW, { mode: "always" }, "regular", 0)
    ).rejects.toThrow("Choose a break duration from 1 minute to 1 hour.");
    await expect(
      settingsStore.addScheduledBreakRule(45, NOW, { mode: "always" }, "regular", 61)
    ).rejects.toThrow("Choose a break duration from 1 minute to 1 hour.");
  });

  it("migrates existing scheduled break rules to a 5 minute break duration", async () => {
    const { storage, settingsStore } = createManager();
    await storage.set({
      [SETTINGS_STORAGE_KEY]: {
        schemaVersion: 1,
        trackingEnabled: true,
        privateBrowserTrackingEnabled: false,
        idleThresholdSeconds: 60,
        blockedDomains: [],
        timeLimitedDomains: [],
        scheduledBreakRules: [
          {
            id: "old-break-rule",
            enabled: true,
            windowScope: "regular",
            breakAfterMinutes: 45,
            schedule: { mode: "always" },
            createdAt: NOW - 1_000,
            updatedAt: NOW - 1_000
          }
        ],
        ignoredDomains: [],
        showBlockedAttemptCount: true,
        historyRetentionDays: null,
        createdAt: NOW - 1_000,
        updatedAt: NOW - 1_000
      }
    });

    const migrated = await settingsStore.migrateStoredSettings(NOW);

    expect(migrated.created).toBe(false);
    expect(migrated.changed).toBe(true);
    expect(migrated.settings.scheduledBreakRules[0]).toMatchObject({
      id: "old-break-rule",
      enabled: true,
      breakDurationMinutes: 5
    });
  });

  it("triggers a break when active browsing reaches the threshold", async () => {
    const { manager, settingsStore, runtimeStateStore, tabsUpdate, trackingEngine } = createManager(
      NOW,
      [makeTab({ id: 7, url: "https://github.com/openai" })]
    );
    await settingsStore.addScheduledBreakRule(45, NOW - 60 * 60 * 1000);
    await runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "regular",
      sessionStartedAt: NOW - 46 * 60 * 1000,
      lastTransitionAt: NOW - 46 * 60 * 1000,
      revision: 1
    });

    await manager.refresh();

    expect(tabsUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        url: expect.stringContaining("target=break")
      })
    );
    expect(trackingEngine.stopTrackingForTab).toHaveBeenCalledWith(7, "navigation");
    expect(await manager.getStatus()).toMatchObject({
      visible: true,
      breakActive: true,
      remainingBreakMs: 5 * 60 * 1000
    });
  });

  it("does not count idle or unfocused time from runtime state", async () => {
    const { manager, settingsStore, runtimeStateStore, tabsUpdate } = createManager(NOW, [
      makeTab({ id: 7, url: "https://github.com/openai" })
    ]);
    await settingsStore.addScheduledBreakRule(45, NOW - 60 * 60 * 1000);
    await runtimeStateStore.set({
      status: "idle",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "regular",
      sessionStartedAt: NOW - 46 * 60 * 1000,
      lastTransitionAt: NOW - 46 * 60 * 1000,
      revision: 1
    });

    await manager.refresh();

    expect(tabsUpdate).not.toHaveBeenCalled();
    expect(await manager.getStatus()).toMatchObject({
      breakActive: false,
      nextBreakAfterMs: 45 * 60 * 1000
    });
  });

  it("counts completed active sessions toward the threshold", async () => {
    const { manager, settingsStore, sessionRepository, tabsUpdate } = createManager(NOW, [
      makeTab({ id: 7, url: "https://github.com/openai" })
    ]);
    await settingsStore.addScheduledBreakRule(45, NOW - 60 * 60 * 1000);
    await sessionRepository.add(makeSession(NOW - 50 * 60 * 1000, NOW - 4 * 60 * 1000));

    await manager.refresh();

    expect(tabsUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        url: expect.stringContaining("target=break")
      })
    );
  });

  it("respects scheduled windows before triggering a break", async () => {
    const inWindow = new Date(2026, 6, 23, 14, 0, 0).getTime();
    const outsideWindow = new Date(2026, 6, 23, 12, 0, 0).getTime();
    const schedule: ScheduleConfig = {
      mode: "custom" as const,
      daysOfWeek: [THURSDAY],
      startMinutes: 13 * 60,
      endMinutes: 17 * 60
    };
    const outside = createManager(outsideWindow, [
      makeTab({ id: 7, url: "https://github.com/openai" })
    ]);
    await outside.settingsStore.addScheduledBreakRule(45, outsideWindow - 60 * 60 * 1000, schedule);
    await outside.runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "regular",
      sessionStartedAt: outsideWindow - 46 * 60 * 1000,
      lastTransitionAt: outsideWindow - 46 * 60 * 1000,
      revision: 1
    });

    await outside.manager.refresh();
    expect(outside.tabsUpdate).not.toHaveBeenCalled();

    const inside = createManager(inWindow, [makeTab({ id: 7, url: "https://github.com/openai" })]);
    await inside.settingsStore.addScheduledBreakRule(45, inWindow - 60 * 60 * 1000, schedule);
    await inside.runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "regular",
      sessionStartedAt: inWindow - 46 * 60 * 1000,
      lastTransitionAt: inWindow - 46 * 60 * 1000,
      revision: 1
    });

    await inside.manager.refresh();
    expect(inside.tabsUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        url: expect.stringContaining("target=break")
      })
    );
  });

  it("ends a break after the configured wall-clock duration without immediately retriggering", async () => {
    const setup = createManager(NOW, [makeTab({ id: 7, url: "https://github.com/openai" })]);
    await setup.settingsStore.addScheduledBreakRule(45, NOW - 60 * 60 * 1000);
    await setup.runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "regular",
      sessionStartedAt: NOW - 46 * 60 * 1000,
      lastTransitionAt: NOW - 46 * 60 * 1000,
      revision: 1
    });

    await setup.manager.refresh();
    expect((await setup.manager.getStatus()).breakActive).toBe(true);
    setup.tabsUpdate.mockClear();

    const afterBreak = new ScheduledBreakManager({
      settingsStore: setup.settingsStore,
      runtimeStateStore: setup.runtimeStateStore,
      sessionRepository: setup.sessionRepository,
      trackingEngine: setup.trackingEngine,
      storageArea: setup.storage,
      now: () => NOW + 6 * 60 * 1000
    });

    await afterBreak.refresh();

    expect(setup.tabsUpdate).not.toHaveBeenCalled();
    expect(await afterBreak.getStatus()).toMatchObject({
      visible: true,
      breakActive: false
    });
  });

  it("uses the configured break duration for active break enforcement", async () => {
    const { manager, settingsStore, runtimeStateStore } = createManager(NOW, [
      makeTab({ id: 7, url: "https://github.com/openai" })
    ]);
    await settingsStore.addScheduledBreakRule(
      45,
      NOW - 60 * 60 * 1000,
      { mode: "always" },
      "regular",
      10
    );
    await runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "regular",
      sessionStartedAt: NOW - 46 * 60 * 1000,
      lastTransitionAt: NOW - 46 * 60 * 1000,
      revision: 1
    });

    await manager.refresh();

    expect(await manager.getStatus()).toMatchObject({
      breakActive: true,
      remainingBreakMs: 10 * 60 * 1000,
      canEndBreak: false,
      canEndBreakAt: NOW + 5 * 60 * 1000
    });
  });

  it("prevents early break ending before 5 minutes and allows it afterward", async () => {
    const setup = createManager(NOW, [makeTab({ id: 7, url: "https://github.com/openai" })]);
    await setup.settingsStore.addScheduledBreakRule(
      45,
      NOW - 60 * 60 * 1000,
      { mode: "always" },
      "regular",
      10
    );
    await setup.runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "regular",
      sessionStartedAt: NOW - 46 * 60 * 1000,
      lastTransitionAt: NOW - 46 * 60 * 1000,
      revision: 1
    });

    await setup.manager.refresh();
    await expect(setup.manager.endActiveBreak("regular")).rejects.toThrow(
      "Breaks can be ended after the first 5 minutes."
    );

    const afterUnlock = new ScheduledBreakManager({
      settingsStore: setup.settingsStore,
      runtimeStateStore: setup.runtimeStateStore,
      sessionRepository: setup.sessionRepository,
      trackingEngine: setup.trackingEngine,
      storageArea: setup.storage,
      now: () => NOW + 6 * 60 * 1000
    });
    const status = await afterUnlock.endActiveBreak("regular");

    expect(status).toMatchObject({
      visible: true,
      breakActive: false,
      canEndBreak: false
    });
    expect((await setup.settingsStore.get()).scheduledBreakRules[0]).toMatchObject({
      enabled: true,
      breakDurationMinutes: 10
    });
  });

  it("DND pauses break enforcement until turned off", async () => {
    const { manager, settingsStore, runtimeStateStore, tabsUpdate } = createManager(NOW, [
      makeTab({ id: 7, url: "https://github.com/openai" })
    ]);
    await settingsStore.addScheduledBreakRule(45, NOW - 60 * 60 * 1000);
    await manager.setDnd(true, "regular");
    await runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "regular",
      sessionStartedAt: NOW - 46 * 60 * 1000,
      lastTransitionAt: NOW - 46 * 60 * 1000,
      revision: 1
    });

    await manager.refresh();

    expect(tabsUpdate).not.toHaveBeenCalled();
    expect(await manager.getStatus()).toMatchObject({
      visible: true,
      dndEnabled: true,
      breakActive: false
    });
  });

  it("respects private scope and browser private tracking setting", async () => {
    const { manager, settingsStore, runtimeStateStore, tabsUpdate } = createManager(NOW, [
      makeTab({ id: 7, url: "https://github.com/openai", incognito: true })
    ]);
    await settingsStore.addScheduledBreakRule(
      45,
      NOW - 60 * 60 * 1000,
      { mode: "always" },
      "private"
    );
    await runtimeStateStore.set({
      status: "tracking",
      activeTabId: 7,
      activeWindowId: 1,
      domain: "github.com",
      windowScope: "private",
      sessionStartedAt: NOW - 46 * 60 * 1000,
      lastTransitionAt: NOW - 46 * 60 * 1000,
      revision: 1
    });

    await manager.refresh();
    expect(tabsUpdate).not.toHaveBeenCalled();

    await settingsStore.update({ privateBrowserTrackingEnabled: true }, NOW);
    await manager.refresh();
    expect(tabsUpdate).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        url: expect.stringContaining("scope=private")
      })
    );
  });
});
