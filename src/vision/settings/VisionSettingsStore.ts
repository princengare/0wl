import { VISION_SETTINGS_STORAGE_KEY } from "@/shared/constants";
import { normalizeDomain } from "@/shared/domain";
import { ALWAYS_SCHEDULE, normalizeSchedule } from "@/shared/schedule";
import { browser as extensionBrowser } from "@/shared/browser";
import { isPlainObject } from "@/shared/validation";
import type { ScheduleConfig } from "@/shared/types";
import type { FrictionLevel, VisionFrictionRule, VisionSettings } from "../types";

type StorageArea = browser.storage.StorageArea;

function isFrictionLevel(value: unknown): value is FrictionLevel {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

function createDefaultVisionSettings(now: number): VisionSettings {
  return {
    schemaVersion: 1,
    adaptiveRecommendationsEnabled: true,
    adaptiveEnforcementEnabled: false,
    maxAutomaticFrictionLevel: 2,
    excludedAdaptiveDomains: [],
    dismissedRecommendationIds: [],
    frictionRules: [],
    createdAt: now,
    updatedAt: now
  };
}

function normalizeFrictionRule(value: unknown): VisionFrictionRule | null {
  if (!isPlainObject(value) || typeof value.domain !== "string") {
    return null;
  }

  try {
    const domain = normalizeDomain(value.domain);
    return {
      id: typeof value.id === "string" ? value.id : `${domain}-${Date.now()}`,
      domain,
      enabled: typeof value.enabled === "boolean" ? value.enabled : true,
      level: isFrictionLevel(value.level) ? value.level : 1,
      schedule: normalizeSchedule(value.schedule).schedule,
      createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now()
    };
  } catch {
    return null;
  }
}

function normalizeSettings(value: unknown, now: number): VisionSettings | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const defaults = createDefaultVisionSettings(now);
  return {
    schemaVersion: 1,
    adaptiveRecommendationsEnabled:
      typeof value.adaptiveRecommendationsEnabled === "boolean"
        ? value.adaptiveRecommendationsEnabled
        : defaults.adaptiveRecommendationsEnabled,
    adaptiveEnforcementEnabled:
      typeof value.adaptiveEnforcementEnabled === "boolean"
        ? value.adaptiveEnforcementEnabled
        : defaults.adaptiveEnforcementEnabled,
    maxAutomaticFrictionLevel: isFrictionLevel(value.maxAutomaticFrictionLevel)
      ? value.maxAutomaticFrictionLevel
      : defaults.maxAutomaticFrictionLevel,
    excludedAdaptiveDomains: Array.isArray(value.excludedAdaptiveDomains)
      ? value.excludedAdaptiveDomains.flatMap((domain) => {
          if (typeof domain !== "string") {
            return [];
          }

          try {
            return [normalizeDomain(domain)];
          } catch {
            return [];
          }
        })
      : [],
    dismissedRecommendationIds: Array.isArray(value.dismissedRecommendationIds)
      ? value.dismissedRecommendationIds.filter((id): id is string => typeof id === "string")
      : [],
    frictionRules: Array.isArray(value.frictionRules)
      ? value.frictionRules.flatMap((rule) => {
          const normalized = normalizeFrictionRule(rule);
          return normalized ? [normalized] : [];
        })
      : [],
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : now
  };
}

export class VisionSettingsStore {
  constructor(private readonly storageArea: StorageArea = extensionBrowser.storage.local) {}

  async get(now = Date.now()): Promise<VisionSettings> {
    const result = (await this.storageArea.get(VISION_SETTINGS_STORAGE_KEY)) as Record<
      string,
      unknown
    >;
    const settings = normalizeSettings(result[VISION_SETTINGS_STORAGE_KEY], now);

    if (settings) {
      return settings;
    }

    const defaults = createDefaultVisionSettings(now);
    await this.storageArea.set({ [VISION_SETTINGS_STORAGE_KEY]: defaults });
    return defaults;
  }

  async update(changes: Partial<VisionSettings>, now = Date.now()): Promise<VisionSettings> {
    const current = await this.get(now);
    const next: VisionSettings = {
      ...current,
      adaptiveRecommendationsEnabled:
        changes.adaptiveRecommendationsEnabled ?? current.adaptiveRecommendationsEnabled,
      adaptiveEnforcementEnabled:
        changes.adaptiveEnforcementEnabled ?? current.adaptiveEnforcementEnabled,
      maxAutomaticFrictionLevel:
        changes.maxAutomaticFrictionLevel ?? current.maxAutomaticFrictionLevel,
      excludedAdaptiveDomains:
        changes.excludedAdaptiveDomains?.map((domain) => normalizeDomain(domain)) ??
        current.excludedAdaptiveDomains,
      updatedAt: now
    };
    await this.storageArea.set({ [VISION_SETTINGS_STORAGE_KEY]: next });
    return next;
  }

  async dismissRecommendation(id: string, now = Date.now()): Promise<VisionSettings> {
    const current = await this.get(now);
    const dismissedRecommendationIds = [...new Set([...current.dismissedRecommendationIds, id])];
    const next = { ...current, dismissedRecommendationIds, updatedAt: now };
    await this.storageArea.set({ [VISION_SETTINGS_STORAGE_KEY]: next });
    return next;
  }

  async upsertFrictionRule(
    domainInput: string,
    level: FrictionLevel,
    schedule?: ScheduleConfig,
    enabled = true,
    now = Date.now()
  ): Promise<VisionSettings> {
    const domain = normalizeDomain(domainInput);
    const current = await this.get(now);
    const existing = current.frictionRules.find((rule) => rule.domain === domain);
    const nextRule: VisionFrictionRule = {
      id: existing?.id ?? `${domain}-${now}`,
      domain,
      enabled,
      level,
      schedule: schedule
        ? normalizeSchedule(schedule).schedule
        : (existing?.schedule ?? ALWAYS_SCHEDULE),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    const next = {
      ...current,
      frictionRules: [
        ...current.frictionRules.filter((rule) => rule.domain !== domain),
        nextRule
      ].sort((a, b) => a.domain.localeCompare(b.domain)),
      updatedAt: now
    };
    await this.storageArea.set({ [VISION_SETTINGS_STORAGE_KEY]: next });
    return next;
  }

  async removeFrictionRule(id: string, now = Date.now()): Promise<VisionSettings> {
    const current = await this.get(now);
    const next = {
      ...current,
      frictionRules: current.frictionRules.filter((rule) => rule.id !== id),
      updatedAt: now
    };
    await this.storageArea.set({ [VISION_SETTINGS_STORAGE_KEY]: next });
    return next;
  }
}
