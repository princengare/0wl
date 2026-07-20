import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaActivityTracker } from "@/background/media/MediaActivityTracker";
import type { ActiveContextResolver } from "@/background/tracking/ActiveContextResolver";
import type { SessionRepository } from "@/db/repositories/SessionRepository";
import { SettingsStore } from "@/storage/SettingsStore";
import { MemoryStorageArea } from "./helpers/memoryStorage";
import type { ActiveBrowserContext, UsageSession } from "@/shared/types";

const START = new Date(2026, 6, 6, 12, 0, 0).getTime();

interface MediaReportOptions {
  playingAudio?: boolean;
  playingVideo?: boolean;
  pictureInPictureSupported?: boolean;
}

function tab(id: number, url: string, overrides: Partial<browser.tabs.Tab> = {}): browser.tabs.Tab {
  return {
    id,
    url,
    active: false,
    audible: false,
    incognito: false,
    windowId: 1,
    index: id,
    highlighted: false,
    pinned: false,
    hidden: false,
    discarded: false,
    autoDiscardable: true,
    ...overrides
  };
}

function context(
  activeTabId: number | null,
  idleState: ActiveBrowserContext["idleState"] = "active"
) {
  return {
    browserFocused: activeTabId !== null,
    idleState,
    activeTabId,
    activeWindowId: 1,
    url: activeTabId === null ? null : "https://github.com/openai",
    domain: activeTabId === null ? null : "github.com",
    windowScope: "regular",
    trackable: activeTabId !== null
  } satisfies ActiveBrowserContext;
}

function createTracker(
  tabs: browser.tabs.Tab[],
  activeTabId: number | null,
  nowRef: { value: number }
) {
  const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
  const settingsStore = new SettingsStore(storage);
  const addedSessions: UsageSession[] = [];
  const sessionRepository = {
    add: vi.fn(async (session: UsageSession) => {
      addedSessions.push(session);
    })
  } as unknown as SessionRepository;
  const activeContextResolver = {
    resolve: vi.fn(async () => context(activeTabId))
  } as unknown as ActiveContextResolver;

  vi.stubGlobal("browser", {
    tabs: {
      query: vi.fn(async () => tabs)
    },
    storage: {
      local: storage
    }
  });

  const tracker = new MediaActivityTracker({
    settingsStore,
    sessionRepository,
    activeContextResolver,
    storageArea: storage,
    now: () => nowRef.value
  });

  return {
    tracker,
    settingsStore,
    addedSessions,
    activeContextResolver
  };
}

async function report(
  tracker: MediaActivityTracker,
  senderTab: browser.tabs.Tab,
  playing: boolean,
  pictureInPicture: boolean,
  now: number,
  options: MediaReportOptions = {}
): Promise<void> {
  await tracker.handleMediaStateReport(
    {
      type: "REPORT_MEDIA_STATE",
      url: senderTab.url ?? "about:blank",
      playing,
      playingAudio: options.playingAudio ?? false,
      playingVideo: options.playingVideo ?? playing,
      pictureInPicture,
      pictureInPictureSupported: options.pictureInPictureSupported ?? true,
      reportedAt: now
    },
    { tab: senderTab } as browser.runtime.MessageSender
  );
}

describe("media activity tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "media-session-id")
    });
  });

  it("records background media for a playing non-active tab", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const media = tab(2, "https://youtube.com/watch?v=1");
    const { tracker, addedSessions } = createTracker([active, media], 1, now);

    await report(tracker, media, true, false, now.value);
    now.value += 60_000;
    await report(tracker, media, false, false, now.value);

    expect(addedSessions).toHaveLength(1);
    expect(addedSessions[0]).toMatchObject({
      domain: "youtube.com",
      usageMode: "background",
      windowScope: "regular",
      durationMs: 60_000
    });
  });

  it("returns live background media sessions before playback stops", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const media = tab(2, "https://youtube.com/watch?v=1");
    const { tracker, addedSessions } = createTracker([active, media], 1, now);

    await report(tracker, media, true, false, now.value);
    now.value += 45_000;

    const liveSessions = await tracker.getLiveSessions(
      START,
      START + 60_000,
      "regular",
      "background"
    );

    expect(addedSessions).toHaveLength(0);
    expect(liveSessions).toHaveLength(1);
    expect(liveSessions[0]).toMatchObject({
      domain: "youtube.com",
      usageMode: "background",
      durationMs: 45_000
    });
  });

  it("does not treat active-tab media as background media", async () => {
    const now = { value: START };
    const media = tab(2, "https://youtube.com/watch?v=1", { active: true });
    const { tracker, addedSessions } = createTracker([media], 2, now);

    await report(tracker, media, true, false, now.value);
    now.value += 60_000;
    await report(tracker, media, false, false, now.value);

    expect(addedSessions).toHaveLength(0);
  });

  it("records Picture-in-Picture media separately", async () => {
    const now = { value: START };
    const media = tab(2, "https://youtube.com/watch?v=1", { active: true });
    const { tracker, addedSessions } = createTracker([media], 2, now);

    await report(tracker, media, true, true, now.value);
    now.value += 90_000;
    await report(tracker, media, false, false, now.value);

    expect(addedSessions).toHaveLength(1);
    expect(addedSessions[0]).toMatchObject({
      domain: "youtube.com",
      usageMode: "pip",
      durationMs: 90_000
    });
  });

  it("returns live Picture-in-Picture media sessions before playback stops", async () => {
    const now = { value: START };
    const media = tab(2, "https://youtube.com/watch?v=1", { active: true });
    const { tracker, addedSessions } = createTracker([media], 2, now);

    await report(tracker, media, true, true, now.value);
    now.value += 45_000;

    const liveSessions = await tracker.getLiveSessions(START, START + 60_000, "regular", "pip");

    expect(addedSessions).toHaveLength(0);
    expect(liveSessions).toHaveLength(1);
    expect(liveSessions[0]).toMatchObject({
      domain: "youtube.com",
      usageMode: "pip",
      durationMs: 45_000
    });
  });

  it("does not double-count background media when a tab enters Picture-in-Picture", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const media = tab(2, "https://youtube.com/watch?v=1");
    const { tracker, addedSessions } = createTracker([active, media], 1, now);

    await report(tracker, media, true, false, now.value, {
      playingAudio: false,
      playingVideo: true,
      pictureInPictureSupported: true
    });
    now.value += 30_000;
    await report(tracker, media, true, true, now.value, {
      playingAudio: false,
      playingVideo: true,
      pictureInPictureSupported: true
    });
    now.value += 60_000;
    await report(tracker, media, false, false, now.value);

    expect(addedSessions).toHaveLength(2);
    expect(addedSessions[0]).toMatchObject({
      usageMode: "background",
      durationMs: 30_000
    });
    expect(addedSessions[1]).toMatchObject({
      usageMode: "pip",
      durationMs: 60_000
    });
  });

  it("returns from Picture-in-Picture to background media without overlapping sessions", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const media = tab(2, "https://youtube.com/watch?v=1");
    const { tracker, addedSessions } = createTracker([active, media], 1, now);

    await report(tracker, media, true, true, now.value, {
      playingAudio: false,
      playingVideo: true,
      pictureInPictureSupported: true
    });
    now.value += 60_000;
    await report(tracker, media, true, false, now.value, {
      playingAudio: false,
      playingVideo: true,
      pictureInPictureSupported: true
    });
    now.value += 30_000;
    await report(tracker, media, false, false, now.value);

    expect(addedSessions).toHaveLength(2);
    expect(addedSessions[0]).toMatchObject({
      usageMode: "pip",
      durationMs: 60_000
    });
    expect(addedSessions[1]).toMatchObject({
      usageMode: "background",
      durationMs: 30_000
    });
  });

  it("keeps unsupported non-active video in background because no browser PiP state is exposed", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const media = tab(2, "https://youtube.com/watch?v=1");
    const { tracker, addedSessions } = createTracker([active, media], 1, now);

    await report(tracker, media, true, false, now.value, {
      playingAudio: false,
      playingVideo: true,
      pictureInPictureSupported: false
    });
    now.value += 60_000;
    await report(tracker, media, false, false, now.value);

    expect(addedSessions).toHaveLength(1);
    expect(addedSessions[0]).toMatchObject({
      usageMode: "background",
      durationMs: 60_000
    });
  });

  it("still records non-active audio as background when PiP state is unsupported", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const media = tab(2, "https://music.youtube.com/watch?v=1");
    const { tracker, addedSessions } = createTracker([active, media], 1, now);

    await report(tracker, media, true, false, now.value, {
      playingAudio: true,
      playingVideo: false,
      pictureInPictureSupported: false
    });
    now.value += 60_000;
    await report(tracker, media, false, false, now.value);

    expect(addedSessions).toHaveLength(1);
    expect(addedSessions[0]).toMatchObject({
      domain: "youtube.com",
      usageMode: "background",
      durationMs: 60_000
    });
  });

  it("does not record media sessions while viewing the public 0wl app surface", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const media = tab(2, "https://princengare.github.io/0wl/privacy.html");
    const { tracker, addedSessions } = createTracker([active, media], 1, now);

    await report(tracker, media, true, false, now.value, {
      playingAudio: true,
      playingVideo: false,
      pictureInPictureSupported: true
    });
    now.value += 60_000;
    await report(tracker, media, false, false, now.value);

    expect(addedSessions).toHaveLength(0);
  });

  it("respects the private browser tracking setting", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const privateMedia = tab(2, "https://youtube.com/watch?v=1", { incognito: true });
    const { tracker, settingsStore, addedSessions } = createTracker([active, privateMedia], 1, now);

    await report(tracker, privateMedia, true, false, now.value);
    now.value += 30_000;
    await report(tracker, privateMedia, false, false, now.value);

    expect(addedSessions).toHaveLength(0);

    await settingsStore.update({ privateBrowserTrackingEnabled: true }, now.value);
    await report(tracker, privateMedia, true, false, now.value);
    now.value += 30_000;
    await report(tracker, privateMedia, false, false, now.value);

    expect(addedSessions).toHaveLength(1);
    expect(addedSessions[0]).toMatchObject({
      windowScope: "private",
      usageMode: "background",
      durationMs: 30_000
    });
  });

  it("recovers stale media state without counting unknown downtime", async () => {
    const now = { value: START };
    const active = tab(1, "https://github.com/openai", { active: true });
    const media = tab(2, "https://youtube.com/watch?v=1");
    const { tracker, addedSessions } = createTracker([active, media], 1, now);

    await report(tracker, media, true, false, now.value);
    now.value += 15_000;
    await report(tracker, media, true, false, now.value);
    now.value += 10 * 60_000;
    await tracker.recoverConservatively("startup");

    expect(addedSessions).toHaveLength(1);
    expect(addedSessions[0]).toMatchObject({
      usageMode: "background",
      startedAt: START,
      endedAt: START + 15_000,
      durationMs: 15_000
    });
  });
});
