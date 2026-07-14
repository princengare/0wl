import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrictionRuleManager } from "@/vision/friction/FrictionRuleManager";
import { DomainClassificationStore } from "@/vision/classification/DomainClassificationStore";
import { DomainClassifier } from "@/vision/classification/DomainClassifier";
import { DistractionPathwayDetector } from "@/vision/pathways/DistractionPathwayDetector";
import { RecommendationEngine } from "@/vision/recommendations/RecommendationEngine";
import { VisionSettingsStore } from "@/vision/settings/VisionSettingsStore";
import { DATABASE_VERSION, FRICTION_RULE_ALARM_NAME } from "@/shared/constants";
import { ALWAYS_SCHEDULE, WEEKDAYS } from "@/shared/schedule";
import type { UsageSession } from "@/shared/types";
import type { VisionSettings } from "@/vision/types";
import { MemoryStorageArea } from "./helpers/memoryStorage";

interface DynamicUpdateOptions {
  removeRuleIds?: number[];
  addRules?: browser.declarativeNetRequest.Rule[];
}

function makeSession(id: string, domain: string, startedAt: number, endedAt: number): UsageSession {
  return {
    id,
    domain,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    startReason: "startup",
    endReason: "navigation",
    dateKey: "2026-07-06",
    createdAt: endedAt
  };
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

  it("detects a focus-to-distraction pathway without remote data", async () => {
    const classifier = new DomainClassifier(
      new DomainClassificationStore(
        new MemoryStorageArea() as unknown as browser.storage.StorageArea
      )
    );
    const sessions = [
      makeSession("s1", "github.com", 0, 10 * 60 * 1000),
      makeSession("s2", "youtube.com", 11 * 60 * 1000, 20 * 60 * 1000),
      makeSession("s3", "instagram.com", 21 * 60 * 1000, 30 * 60 * 1000)
    ];
    const classifications = await classifier.classifyMany(
      sessions.map((session) => session.domain)
    );

    const pathways = new DistractionPathwayDetector().detect(sessions, classifications);

    expect(pathways[0]?.domains).toEqual(["github.com", "youtube.com", "instagram.com"]);
    expect(pathways[0]?.count).toBe(1);
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
          commonEntry: "github.com"
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
