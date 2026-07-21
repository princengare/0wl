import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrictionRuleManager } from "@/vision/friction/FrictionRuleManager";
import { DomainClassificationStore } from "@/vision/classification/DomainClassificationStore";
import { DomainClassifier } from "@/vision/classification/DomainClassifier";
import { BlockEvasionDetector } from "@/vision/blocking/BlockEvasionDetector";
import { BlockAttemptHeatmapAnalyzer } from "@/vision/heatmaps/BlockAttemptHeatmapAnalyzer";
import { DistractionPathwayDetector } from "@/vision/pathways/DistractionPathwayDetector";
import { sessionDriftsFromPathways } from "@/vision/pathways/pathwayAnalytics";
import { RecommendationEngine } from "@/vision/recommendations/RecommendationEngine";
import { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import { VisionReportService } from "@/vision/VisionReportService";
import { DATABASE_VERSION, FRICTION_RULE_ALARM_NAME } from "@/shared/constants";
import { ALWAYS_SCHEDULE, WEEKDAYS } from "@/shared/schedule";
import { createDefaultSettings } from "@/storage/defaults";
import type {
  BlockAttempt,
  EndReason,
  StartReason,
  UsageSession,
  WindowScope
} from "@/shared/types";
import type { DomainCategory, DomainTransition, VisionSettings } from "@/vision/types";
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
  overrides: Partial<{
    startReason: StartReason;
    endReason: EndReason;
    windowScope: WindowScope;
  }> = {}
): UsageSession {
  return {
    id,
    domain,
    windowScope: overrides.windowScope,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    startReason: overrides.startReason ?? "startup",
    endReason: overrides.endReason ?? "navigation",
    dateKey: "2026-07-06",
    createdAt: endedAt
  };
}

function makeAttempt(
  id: string,
  domain: string,
  attemptedAt: number,
  windowScope: WindowScope = "regular"
): BlockAttempt {
  return {
    id,
    domain,
    windowScope,
    attemptedAt,
    dateKey: "2026-07-06",
    source: "navigation",
    count: 1
  };
}

function makeTransition(
  id: string,
  fromSessionId: string,
  toSessionId: string,
  fromDomain: string,
  toDomain: string,
  transitionedAt: number,
  fromCategory: DomainCategory | null = null,
  toCategory: DomainCategory | null = null
): DomainTransition {
  return {
    id,
    fromSessionId,
    toSessionId,
    fromDomain,
    toDomain,
    fromCategory,
    toCategory,
    transitionedAt,
    gapMs: 1_000,
    previousSessionDurationMs: 60_000,
    dateKey: "2026-07-06"
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

  it("keeps domain detail in blocked-attempt heatmaps and creates an applyable block recommendation", () => {
    const attempts = [
      makeAttempt("a1", "instagram.com", new Date(2026, 6, 6, 13, 5).getTime()),
      { ...makeAttempt("a2", "instagram.com", new Date(2026, 6, 6, 13, 20).getTime()), count: 2 },
      makeAttempt("a3", "reddit.com", new Date(2026, 6, 6, 13, 45).getTime())
    ];
    const heatmap = new BlockAttemptHeatmapAnalyzer().analyze(attempts);
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
      heatmap,
      pathways: [],
      substitutions: [],
      settings
    });

    expect(heatmap[0]).toMatchObject({
      count: 4,
      domains: [
        { domain: "instagram.com", count: 3 },
        { domain: "reddit.com", count: 1 }
      ]
    });
    expect(recommendations[0]).toMatchObject({
      reason: "instagram.com attempts cluster around 1:00 PM-2:00 PM.",
      domains: ["instagram.com"],
      action: {
        type: "add_block",
        domain: "instagram.com",
        schedule: {
          mode: "custom",
          daysOfWeek: [1],
          startMinutes: 13 * 60,
          endMinutes: 14 * 60
        }
      }
    });
  });

  it("builds every Vision roadmap section from regular local data", async () => {
    const base = new Date(2026, 6, 6, 9, 0, 0).getTime();
    const at = (offsetMinutes: number) => base + minutes(offsetMinutes);
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const classifier = new DomainClassifier(new DomainClassificationStore(storage));
    const settings = createDefaultSettings(base);
    const visionSettings: VisionSettings = {
      schemaVersion: 1,
      adaptiveRecommendationsEnabled: true,
      adaptiveEnforcementEnabled: false,
      maxAutomaticFrictionLevel: 2,
      excludedAdaptiveDomains: [],
      dismissedRecommendationIds: [],
      frictionRules: [],
      createdAt: base,
      updatedAt: base
    };
    settings.blockedDomains = [
      {
        id: "regular-instagram",
        domain: "instagram.com",
        windowScope: "regular",
        enabled: true,
        schedule: ALWAYS_SCHEDULE,
        createdAt: at(10)
      }
    ];
    const sessions = [
      makeSession("pre-instagram", "instagram.com", at(-2 * 24 * 60), at(-2 * 24 * 60 + 60)),
      makeSession("s1", "github.com", at(0), at(3)),
      makeSession("s1-docs", "wxt.dev", at(3.5), at(6)),
      makeSession("s2", "reddit.com", at(6.5), at(9)),
      makeSession("s3", "github.com", at(20), at(23)),
      makeSession("s3-docs", "wxt.dev", at(23.5), at(26)),
      makeSession("s4", "reddit.com", at(26.5), at(29)),
      makeSession("s5", "github.com", at(40), at(43)),
      makeSession("s5-docs", "wxt.dev", at(43.5), at(46)),
      makeSession("s6", "reddit.com", at(46.5), at(49)),
      makeSession("post-reddit-substitute", "reddit.com", at(24 * 60), at(24 * 60 + 20))
    ];
    const attempts = [
      { ...makeAttempt("a1", "instagram.com", at(6.25)), count: 2 },
      makeAttempt("a2", "instagram.com", at(19.5)),
      makeAttempt("a3", "instagram.com", at(26.25))
    ];
    const transitions = [
      makeTransition("t1", "s1", "s1-docs", "github.com", "wxt.dev", at(3.5), "coding", "research"),
      makeTransition("t2", "s1-docs", "s2", "wxt.dev", "reddit.com", at(6.5), "research", "social"),
      makeTransition("t3", "s2", "s3", "reddit.com", "github.com", at(20), "social", "coding"),
      makeTransition(
        "t3b",
        "s3",
        "s3-docs",
        "github.com",
        "wxt.dev",
        at(23.5),
        "coding",
        "research"
      ),
      makeTransition(
        "t4",
        "s3-docs",
        "s4",
        "wxt.dev",
        "reddit.com",
        at(26.5),
        "research",
        "social"
      ),
      makeTransition("t5", "s4", "s5", "reddit.com", "github.com", at(40), "social", "coding"),
      makeTransition(
        "t6",
        "s5",
        "s5-docs",
        "github.com",
        "wxt.dev",
        at(43.5),
        "coding",
        "research"
      ),
      makeTransition("t7", "s5-docs", "s6", "wxt.dev", "reddit.com", at(46.5), "research", "social")
    ];

    const report = await new VisionReportService({
      sessionRepository: {
        listAll: async () => sessions
      },
      blockAttemptRepository: {
        listAll: async () => attempts
      },
      transitionRepository: {
        listAll: async () => transitions
      },
      settingsStore: {
        get: async () => settings
      },
      visionSettingsStore: {
        get: async () => visionSettings
      },
      domainClassifier: classifier,
      now: () => at(2 * 24 * 60)
    } as unknown as ConstructorParameters<typeof VisionReportService>[0]).buildReport();

    expect(report.pathways[0]?.displayLabel).toBe("Research/dev loop -> reddit.com");
    expect(report.sessionDrifts[0]?.displayLabel).toBe("Research/dev loop -> reddit.com");
    expect(report.contexts[0]).toMatchObject({ domain: "reddit.com" });
    expect(report.recovery.averageRecoveryMs).toBeGreaterThan(0);
    expect(report.heatmap[0]?.domains[0]).toEqual({ domain: "instagram.com", count: 4 });
    expect(report.blockOutcomes[0]).toMatchObject({ domain: "instagram.com", attempts: 4 });
    expect(report.bounceBackRate).toBeGreaterThan(0);
    expect(report.substitutions[0]).toMatchObject({
      blockedDomain: "instagram.com",
      substitutes: [expect.objectContaining({ domain: "reddit.com" })]
    });
    expect(report.netTimeReclaimedMsPerDay).toBeGreaterThan(0);
    expect(report.attemptChains[0]?.displayLabel).toContain("instagram.com blocked -> reddit.com");
    expect(report.blockEvasions[0]?.displayLabel).toBe("instagram.com blocked -> reddit.com");
    expect(report.distractionTransitions[0]).toMatchObject({
      fromDomain: "wxt.dev",
      toDomain: "reddit.com",
      count: 3
    });
    expect(report.focusInterruptions[0]).toMatchObject({
      fromDomain: "wxt.dev",
      toDomain: "reddit.com",
      count: 3
    });
    expect(report.trends.blockedAttemptCount).toBe(4);
    expect(report.trends.weeklyDistractionMs).toBeGreaterThan(0);
    expect(report.recommendations.some((row) => row.action.type === "add_block")).toBe(true);
    expect(report.recommendations.some((row) => row.action.type === "add_friction")).toBe(true);
    expect(report.insights.length).toBeGreaterThan(0);
  });

  it("excludes private-window browsing and blocked attempts from normal Vision reports", async () => {
    const storage = new MemoryStorageArea() as unknown as browser.storage.StorageArea;
    const classifier = new DomainClassifier(new DomainClassificationStore(storage));
    const settings = createDefaultSettings(minutes(0));
    const visionSettings: VisionSettings = {
      schemaVersion: 1,
      adaptiveRecommendationsEnabled: true,
      adaptiveEnforcementEnabled: false,
      maxAutomaticFrictionLevel: 2,
      excludedAdaptiveDomains: [],
      dismissedRecommendationIds: [],
      frictionRules: [],
      createdAt: minutes(0),
      updatedAt: minutes(0)
    };
    settings.blockedDomains = [
      {
        id: "regular-instagram",
        domain: "instagram.com",
        windowScope: "regular",
        enabled: true,
        schedule: ALWAYS_SCHEDULE,
        createdAt: minutes(0)
      },
      {
        id: "private-reddit",
        domain: "reddit.com",
        windowScope: "private",
        enabled: true,
        schedule: ALWAYS_SCHEDULE,
        createdAt: minutes(0)
      }
    ];
    const sessions = [
      makeSession("regular-focus", "github.com", minutes(0), minutes(2)),
      makeSession("regular-after-block", "github.com", minutes(3), minutes(5)),
      makeSession("private-before", "reddit.com", minutes(0), minutes(2), {
        windowScope: "private"
      }),
      makeSession("private-after-block", "youtube.com", minutes(3), minutes(5), {
        windowScope: "private"
      })
    ];
    const attempts = [
      makeAttempt("regular-attempt", "instagram.com", minutes(2.5), "regular"),
      makeAttempt("private-attempt", "reddit.com", minutes(2.5), "private")
    ];
    const transitions = [
      makeTransition(
        "regular-transition",
        "regular-focus",
        "regular-after-block",
        "github.com",
        "github.com",
        minutes(3)
      ),
      makeTransition(
        "private-transition",
        "private-before",
        "private-after-block",
        "reddit.com",
        "youtube.com",
        minutes(3)
      )
    ];
    const report = await new VisionReportService({
      sessionRepository: {
        listAll: async () => sessions
      },
      blockAttemptRepository: {
        listAll: async () => attempts
      },
      transitionRepository: {
        listAll: async () => transitions
      },
      settingsStore: {
        get: async () => settings
      },
      visionSettingsStore: {
        get: async () => visionSettings
      },
      domainClassifier: classifier,
      now: () => minutes(10)
    } as unknown as ConstructorParameters<typeof VisionReportService>[0]).buildReport();

    expect(report.blockOutcomes.map((outcome) => outcome.domain)).toEqual(["instagram.com"]);
    expect(report.heatmap.reduce((sum, cell) => sum + cell.count, 0)).toBe(1);
    expect(report.trends.blockedAttemptCount).toBe(1);
    expect(report.transitions).not.toContainEqual(
      expect.objectContaining({ fromDomain: "reddit.com" })
    );
    expect(report.classifiedDomains.map((classification) => classification.domain)).not.toContain(
      "youtube.com"
    );
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
