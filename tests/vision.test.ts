import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrictionRuleManager } from "@/vision/friction/FrictionRuleManager";
import { DomainClassificationStore } from "@/vision/classification/DomainClassificationStore";
import { DomainClassifier } from "@/vision/classification/DomainClassifier";
import { BlockEvasionDetector } from "@/vision/blocking/BlockEvasionDetector";
import { DistractionPathwayDetector } from "@/vision/pathways/DistractionPathwayDetector";
import { sessionDriftsFromPathways } from "@/vision/pathways/pathwayAnalytics";
import { RecommendationEngine } from "@/vision/recommendations/RecommendationEngine";
import { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import { DATABASE_VERSION, FRICTION_RULE_ALARM_NAME } from "@/shared/constants";
import { ALWAYS_SCHEDULE, WEEKDAYS } from "@/shared/schedule";
import type { BlockAttempt, EndReason, StartReason, UsageSession } from "@/shared/types";
import type { VisionSettings } from "@/vision/types";
import { MemoryStorageArea } from "./helpers/memoryStorage";

interface DynamicUpdateOptions {
  removeRuleIds?: number[];
  addRules?: browser.declarativeNetRequest.Rule[];
}

function makeSession(
  id: string,
  domain: string,
  startedAt: number,
  endedAt: number,
  overrides: Partial<{ startReason: StartReason; endReason: EndReason }> = {}
): UsageSession {
  return {
    id,
    domain,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    startReason: overrides.startReason ?? "startup",
    endReason: overrides.endReason ?? "navigation",
    dateKey: "2026-07-06",
    createdAt: endedAt
  };
}

function makeAttempt(id: string, domain: string, attemptedAt: number): BlockAttempt {
  return {
    id,
    domain,
    attemptedAt,
    dateKey: "2026-07-06",
    source: "navigation",
    count: 1
  };
}

function minutes(value: number): number {
  return value * 60 * 1000;
}

async function classificationsFor(sessions: UsageSession[]) {
  const classifier = new DomainClassifier(
    new DomainClassificationStore(new MemoryStorageArea() as unknown as browser.storage.StorageArea)
  );

  return classifier.classifyMany(sessions.map((session) => session.domain));
}

function recurringCodingToReddit(): UsageSession[] {
  return [
    makeSession("s1", "github.com", minutes(0), minutes(6)),
    makeSession("s2", "reddit.com", minutes(6.5), minutes(9)),
    makeSession("s3", "github.com", minutes(20), minutes(26)),
    makeSession("s4", "reddit.com", minutes(26.5), minutes(29)),
    makeSession("s5", "github.com", minutes(40), minutes(46)),
    makeSession("s6", "reddit.com", minutes(46.5), minutes(49))
  ];
}

function makeBrowserMock() {
  let rules: browser.declarativeNetRequest.Rule[] = [];
  const updateDynamicRules = vi.fn(
    async ({ removeRuleIds = [], addRules = [] }: DynamicUpdateOptions) => {
      rules = rules.filter((rule) => !removeRuleIds.includes(rule.id));
      rules = [...rules, ...addRules];
    }
  );
  const createAlarm = vi.fn();
  const clearAlarm = vi.fn(async () => true);

  vi.stubGlobal("browser", {
    runtime: {
      getURL: (path: string) => `moz-extension://extension-id/${path}`
    },
    declarativeNetRequest: {
      getDynamicRules: vi.fn(async () => rules),
      updateDynamicRules
    },
    alarms: {
      clear: clearAlarm,
      create: createAlarm
    }
  });

  return {
    get rules() {
      return rules;
    },
    createAlarm,
    clearAlarm
  };
}

describe("vision classification and analytics", () => {
  beforeEach(() => {
    makeBrowserMock();
  });

  it("uses seed classifications, supports user overrides, and resets to the seed", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const store = new DomainClassificationStore(storage);
    const classifier = new DomainClassifier(store);

    expect((await classifier.classify("https://github.com/openai"))?.primaryCategory).toBe(
      "coding"
    );
    expect((await classifier.classify("www.instagram.com"))?.primaryCategory).toBe("social");
    expect(await classifier.classify("example-not-in-seed.test")).toBeNull();

    await classifier.setUserClassification("github.com", "distraction");
    expect((await classifier.classify("github.com"))?.primaryCategory).toBe("distraction");

    await classifier.resetUserClassification("github.com");
    expect((await classifier.classify("github.com"))?.primaryCategory).toBe("coding");
  });

  it("detects a recurring focus-to-distraction pathway without remote data", async () => {
    const sessions = recurringCodingToReddit();
    const classifications = await classificationsFor(sessions);

    const pathways = new DistractionPathwayDetector().detect(sessions, classifications);

    expect(pathways[0]).toMatchObject({
      displayLabel: "Coding session -> reddit.com",
      firstDistractionDomain: "reddit.com",
      lastFocusDomain: "github.com",
      count: 3
    });
  });

  it("collapses repeated same-domain runs in pathway details", async () => {
    const occurrence = (offset: number, prefix: string) => [
      makeSession(`${prefix}-1`, "github.com", minutes(offset), minutes(offset + 6)),
      makeSession(`${prefix}-2`, "google.com", minutes(offset + 6.25), minutes(offset + 7)),
      makeSession(`${prefix}-3`, "google.com", minutes(offset + 7.25), minutes(offset + 8)),
      makeSession(`${prefix}-4`, "google.com", minutes(offset + 8.25), minutes(offset + 9)),
      makeSession(`${prefix}-5`, "reddit.com", minutes(offset + 9.5), minutes(offset + 12))
    ];
    const sessions = [...occurrence(0, "a"), ...occurrence(30, "b"), ...occurrence(60, "c")];
    const classifications = await classificationsFor(sessions);

    const pathways = new DistractionPathwayDetector().detect(sessions, classifications);

    expect(pathways[0]?.displayLabel).toBe("Research/dev loop -> reddit.com");
    expect(pathways[0]?.details).toContainEqual(
      expect.objectContaining({
        label: "collapsed segments",
        value: expect.stringContaining("google.com x3")
      })
    );
  });

  it("collapses focus, search, docs, and AI-tool loops before a distraction", async () => {
    const occurrence = (offset: number, prefix: string) => [
      makeSession(`${prefix}-1`, "wikipedia.org", minutes(offset), minutes(offset + 6)),
      makeSession(`${prefix}-2`, "chatgpt.com", minutes(offset + 6.5), minutes(offset + 8)),
      makeSession(`${prefix}-3`, "google.com", minutes(offset + 8.5), minutes(offset + 10)),
      makeSession(`${prefix}-4`, "wxt.dev", minutes(offset + 10.5), minutes(offset + 12)),
      makeSession(`${prefix}-5`, "reddit.com", minutes(offset + 12.5), minutes(offset + 15))
    ];
    const sessions = [...occurrence(0, "a"), ...occurrence(30, "b"), ...occurrence(60, "c")];
    const classifications = await classificationsFor(sessions);

    const pathways = new DistractionPathwayDetector().detect(sessions, classifications);

    expect(pathways[0]).toMatchObject({
      displayLabel: "Research/dev loop -> reddit.com",
      firstDistractionDomain: "reddit.com",
      lastFocusDomain: "wxt.dev"
    });
    expect(pathways[0]?.includedFocusDomains).toEqual([
      "wikipedia.org",
      "chatgpt.com",
      "google.com",
      "wxt.dev"
    ]);
  });

  it("caps long pathway displays instead of showing raw chains", async () => {
    const occurrence = (offset: number, prefix: string) => [
      makeSession(`${prefix}-1`, "wikipedia.org", minutes(offset), minutes(offset + 6)),
      makeSession(`${prefix}-2`, "chatgpt.com", minutes(offset + 6.5), minutes(offset + 8)),
      makeSession(`${prefix}-3`, "google.com", minutes(offset + 8.5), minutes(offset + 10)),
      makeSession(`${prefix}-4`, "claude.ai", minutes(offset + 10.5), minutes(offset + 12)),
      makeSession(`${prefix}-5`, "wxt.dev", minutes(offset + 12.5), minutes(offset + 14)),
      makeSession(`${prefix}-6`, "reddit.com", minutes(offset + 14.5), minutes(offset + 17))
    ];
    const sessions = [...occurrence(0, "a"), ...occurrence(35, "b"), ...occurrence(70, "c")];
    const classifications = await classificationsFor(sessions);

    const pathways = new DistractionPathwayDetector().detect(sessions, classifications);

    expect(pathways[0]?.displaySegments).toEqual(["Research/dev loop", "...", "reddit.com"]);
    expect(pathways[0]?.displaySegments?.length).toBeLessThanOrEqual(5);
  });

  it("hides weak one-off pathways from top pathways", async () => {
    const sessions = [
      makeSession("s1", "github.com", minutes(0), minutes(6)),
      makeSession("s2", "reddit.com", minutes(6.5), minutes(9))
    ];
    const classifications = await classificationsFor(sessions);

    expect(new DistractionPathwayDetector().detect(sessions, classifications)).toEqual([]);
  });

  it("does not treat AI tools as distraction by default", async () => {
    const occurrence = (offset: number, prefix: string) => [
      makeSession(`${prefix}-1`, "github.com", minutes(offset), minutes(offset + 6)),
      makeSession(`${prefix}-2`, "chatgpt.com", minutes(offset + 6.5), minutes(offset + 9))
    ];
    const sessions = [...occurrence(0, "a"), ...occurrence(20, "b"), ...occurrence(40, "c")];
    const classifications = await classificationsFor(sessions);

    expect(new DistractionPathwayDetector().detect(sessions, classifications)).toEqual([]);
  });

  it("compresses drift into a category/context summary", async () => {
    const occurrence = (offset: number, prefix: string) => [
      makeSession(`${prefix}-1`, "wikipedia.org", minutes(offset), minutes(offset + 6)),
      makeSession(`${prefix}-2`, "chatgpt.com", minutes(offset + 6.5), minutes(offset + 8)),
      makeSession(`${prefix}-3`, "wxt.dev", minutes(offset + 8.5), minutes(offset + 10)),
      makeSession(`${prefix}-4`, "reddit.com", minutes(offset + 10.5), minutes(offset + 13))
    ];
    const sessions = [...occurrence(0, "a"), ...occurrence(30, "b"), ...occurrence(60, "c")];
    const classifications = await classificationsFor(sessions);
    const pathways = new DistractionPathwayDetector().detect(sessions, classifications);

    const drifts = sessionDriftsFromPathways(pathways);

    expect(drifts[0]?.displayLabel).toBe("Research/dev loop -> reddit.com");
    expect(drifts[0]?.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "time before drift" }),
        expect.objectContaining({ label: "diversion duration" })
      ])
    );
  });

  it("detects evasion only after a blocked attempt", async () => {
    const attempts = [makeAttempt("a1", "instagram.com", minutes(0))];
    const sessions = [makeSession("s1", "reddit.com", minutes(1), minutes(4))];
    const classifications = await classificationsFor(sessions);

    const evasions = new BlockEvasionDetector().detect(attempts, sessions, classifications);

    expect(evasions[0]).toMatchObject({
      displayLabel: "instagram.com blocked -> reddit.com",
      firstDistractionDomain: "reddit.com"
    });
  });

  it("does not detect evasion from ordinary browsing alone", async () => {
    const sessions = [
      makeSession("s1", "instagram.com", minutes(0), minutes(3)),
      makeSession("s2", "reddit.com", minutes(4), minutes(7))
    ];
    const classifications = await classificationsFor(sessions);

    expect(new BlockEvasionDetector().detect([], sessions, classifications)).toEqual([]);
  });

  it("breaks pathways when the max session gap is exceeded", async () => {
    const occurrence = (offset: number, prefix: string) => [
      makeSession(`${prefix}-1`, "github.com", minutes(offset), minutes(offset + 6)),
      makeSession(`${prefix}-2`, "reddit.com", minutes(offset + 12), minutes(offset + 15))
    ];
    const sessions = [...occurrence(0, "a"), ...occurrence(30, "b"), ...occurrence(60, "c")];
    const classifications = await classificationsFor(sessions);

    expect(new DistractionPathwayDetector().detect(sessions, classifications)).toEqual([]);
  });

  it("breaks pathways across idle or unfocused gaps", async () => {
    const occurrence = (offset: number, prefix: string) => [
      makeSession(`${prefix}-1`, "github.com", minutes(offset), minutes(offset + 6), {
        endReason: "idle"
      }),
      makeSession(`${prefix}-2`, "reddit.com", minutes(offset + 6.5), minutes(offset + 9), {
        startReason: "idle-resumed"
      })
    ];
    const sessions = [...occurrence(0, "a"), ...occurrence(30, "b"), ...occurrence(60, "c")];
    const classifications = await classificationsFor(sessions);

    expect(new DistractionPathwayDetector().detect(sessions, classifications)).toEqual([]);
  });

  it("generates local friction recommendations from recurring pathways", () => {
    const settings: VisionSettings = {
      schemaVersion: 1,
      adaptiveRecommendationsEnabled: true,
      adaptiveEnforcementEnabled: false,
      maxAutomaticFrictionLevel: 2,
      excludedAdaptiveDomains: [],
      dismissedRecommendationIds: [],
      frictionRules: [],
      createdAt: 1,
      updatedAt: 1
    };

    const recommendations = new RecommendationEngine().generate({
      heatmap: [],
      substitutions: [],
      settings,
      pathways: [
        {
          id: "github.com->instagram.com",
          domains: ["github.com", "instagram.com"],
          categories: ["coding", "social"],
          count: 3,
          averageDiversionMs: 20 * 60 * 1000,
          commonEntry: "github.com",
          firstDistractionDomain: "instagram.com"
        }
      ]
    });

    expect(recommendations[0]).toMatchObject({
      action: { type: "add_friction", domain: "instagram.com" }
    });
  });

  it("stores scheduled friction rules without overwriting other vision settings", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const store = new VisionSettingsStore(storage);
    await store.update({ adaptiveRecommendationsEnabled: false }, 1);

    const settings = await store.upsertFrictionRule(
      "https://www.instagram.com/reels/",
      2,
      {
        mode: "custom",
        daysOfWeek: WEEKDAYS,
        startMinutes: 9 * 60,
        endMinutes: 17 * 60
      },
      true,
      2
    );

    expect(settings.adaptiveRecommendationsEnabled).toBe(false);
    expect(settings.frictionRules[0]).toMatchObject({
      domain: "instagram.com",
      level: 2,
      schedule: {
        mode: "custom",
        daysOfWeek: WEEKDAYS,
        startMinutes: 9 * 60,
        endMinutes: 17 * 60
      }
    });
  });

  it("activates scheduled friction rules and schedules the next alarm", async () => {
    const browserMock = makeBrowserMock();
    const manager = new FrictionRuleManager();

    await manager.refreshDynamicRules(
      [
        {
          id: "friction-1",
          domain: "instagram.com",
          enabled: true,
          level: 2,
          schedule: {
            mode: "custom",
            daysOfWeek: [1],
            startMinutes: 9 * 60,
            endMinutes: 17 * 60
          },
          createdAt: 1,
          updatedAt: 1
        }
      ],
      new Date(2026, 6, 6, 10).getTime()
    );

    expect(browserMock.rules).toHaveLength(1);
    expect(browserMock.clearAlarm).toHaveBeenCalledWith(FRICTION_RULE_ALARM_NAME);
    expect(browserMock.createAlarm).toHaveBeenCalledWith(
      FRICTION_RULE_ALARM_NAME,
      expect.objectContaining({ when: new Date(2026, 6, 6, 17).getTime() })
    );
  });

  it("keeps the IndexedDB version forward-only for additive vision stores", () => {
    expect(DATABASE_VERSION).toBeGreaterThanOrEqual(2);
    expect(ALWAYS_SCHEDULE).toEqual({ mode: "always" });
  });
});
