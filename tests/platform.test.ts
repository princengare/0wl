import { describe, expect, it, vi } from "vitest";
import { clearAlarm, createAlarm, isAlarmsApiSupported } from "@/platform/alarmsApi";
import { getPlatformCapabilities } from "@/platform/capabilities";
import {
  getDynamicRules,
  isDynamicRulesApiSupported,
  updateDynamicRules
} from "@/platform/dynamicRulesApi";
import { isIdleApiSupported, queryIdleState, setIdleDetectionInterval } from "@/platform/idleApi";
import { normalizeBrowserTarget } from "@/platform/browserTarget";

describe("platform target and capability detection", () => {
  it("normalizes supported browser targets", () => {
    expect(normalizeBrowserTarget("firefox")).toBe("firefox");
    expect(normalizeBrowserTarget("chrome")).toBe("chrome");
    expect(normalizeBrowserTarget("edge")).toBe("edge");
    expect(normalizeBrowserTarget("opera")).toBe("opera");
    expect(normalizeBrowserTarget("safari")).toBe("safari");
    expect(normalizeBrowserTarget("unknown-browser")).toBe("unknown");
  });

  it("marks Safari-sensitive APIs as partial in the build-time capability report", () => {
    const capabilities = getPlatformCapabilities("safari");

    expect(capabilities.target).toBe("safari");
    expect(capabilities.idleDetection).toBe("partial");
    expect(capabilities.alarms).toBe("partial");
    expect(capabilities.dynamicRules).toBe("partial");
    expect(capabilities.localStorage).toBe("supported");
    expect(capabilities.indexedDb).toBe("supported");
  });

  it("keeps existing browser targets fully supported", () => {
    const capabilities = getPlatformCapabilities("firefox");

    expect(capabilities.dynamicRules).toBe("supported");
    expect(capabilities.visionAnalytics).toBe("supported");
  });
});

describe("platform API fallbacks", () => {
  it("treats a missing idle API as active without throwing", async () => {
    vi.stubGlobal("browser", {});

    expect(isIdleApiSupported()).toBe(false);
    expect(await queryIdleState(60)).toBe("active");
    expect(() => setIdleDetectionInterval(60)).not.toThrow();
  });

  it("treats a missing alarms API as unsupported without throwing", async () => {
    vi.stubGlobal("browser", {});

    expect(isAlarmsApiSupported()).toBe(false);
    expect(await clearAlarm("test-alarm")).toBe(false);
    expect(createAlarm("test-alarm", { when: Date.now() + 1000 })).toBe(false);
  });

  it("treats a missing dynamic rules API as unsupported without throwing", async () => {
    vi.stubGlobal("browser", {});

    expect(isDynamicRulesApiSupported()).toBe(false);
    expect(await getDynamicRules()).toEqual([]);
    await expect(updateDynamicRules({ removeRuleIds: [1], addRules: [] })).resolves.toEqual({
      status: "unsupported"
    });
  });

  it("uses dynamic rules when the browser exposes them", async () => {
    const updateDynamicRulesMock = vi.fn(async () => undefined);
    vi.stubGlobal("browser", {
      declarativeNetRequest: {
        getDynamicRules: vi.fn(async () => []),
        updateDynamicRules: updateDynamicRulesMock
      }
    });

    expect(isDynamicRulesApiSupported()).toBe(true);
    await expect(updateDynamicRules({ removeRuleIds: [1], addRules: [] })).resolves.toEqual({
      status: "supported"
    });
    expect(updateDynamicRulesMock).toHaveBeenCalledWith({ removeRuleIds: [1], addRules: [] });
  });
});
