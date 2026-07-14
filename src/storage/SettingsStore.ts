import { normalizeDomain } from "@/shared/domain";
import { SETTINGS_STORAGE_KEY, createDefaultSettings } from "./defaults";
import { ALWAYS_SCHEDULE, normalizeSchedule } from "@/shared/schedule";
import { browser as extensionBrowser } from "@/shared/browser";
import type {
  BlockedDomain,
  ExtensionSettings,
  ScheduleConfig,
  TimeLimitedDomain
} from "@/shared/types";
import { DEFAULT_IDLE_THRESHOLD_SECONDS } from "@/shared/constants";
import { isPlainObject, isValidIdleThreshold, isValidTimeLimitMinutes } from "@/shared/validation";

type StorageArea = browser.storage.StorageArea;

interface NormalizedSettingsResult {
  settings: ExtensionSettings | null;
  changed: boolean;
}

export interface SettingsMigrationResult {
  settings: ExtensionSettings;
  created: boolean;
  changed: boolean;
}

function createBlockedDomainId(domain: string, now: number, existingIds: Set<string>): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    const id = crypto.randomUUID();
    if (!existingIds.has(id)) {
      return id;
    }
  }

  return `${domain}-${now}`;
}

function createTimeLimitedDomainId(domain: string, now: number, existingIds: Set<string>): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    const id = crypto.randomUUID();
    if (!existingIds.has(id)) {
      return id;
    }
  }

  return `limit-${domain}-${now}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeBlockedDomains(value: unknown): {
  blockedDomains: BlockedDomain[];
  changed: boolean;
} {
  if (!Array.isArray(value)) {
    return { blockedDomains: [], changed: true };
  }

  const seenDomains = new Set<string>();
  const blockedDomains: BlockedDomain[] = [];
  let changed = false;

  for (const candidate of value) {
    if (
      !isPlainObject(candidate) ||
      typeof candidate.domain !== "string" ||
      typeof candidate.enabled !== "boolean" ||
      !isFiniteNumber(candidate.createdAt)
    ) {
      changed = true;
      continue;
    }

    let domain: string;

    try {
      domain = normalizeDomain(candidate.domain);
    } catch {
      changed = true;
      continue;
    }

    if (seenDomains.has(domain)) {
      changed = true;
      continue;
    }

    const id =
      typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id
        : `${domain}-${candidate.createdAt}`;

    const schedule = normalizeSchedule(candidate.schedule);

    blockedDomains.push({
      id,
      domain,
      enabled: candidate.enabled,
      schedule: schedule.schedule,
      createdAt: candidate.createdAt
    });
    seenDomains.add(domain);

    changed ||= id !== candidate.id || domain !== candidate.domain || schedule.changed;
  }

  return { blockedDomains, changed };
}

function normalizeTimeLimitedDomains(value: unknown): {
  timeLimitedDomains: TimeLimitedDomain[];
  changed: boolean;
} {
  if (!Array.isArray(value)) {
    return { timeLimitedDomains: [], changed: true };
  }

  const seenDomains = new Set<string>();
  const timeLimitedDomains: TimeLimitedDomain[] = [];
  let changed = false;

  for (const candidate of value) {
    if (
      !isPlainObject(candidate) ||
      typeof candidate.domain !== "string" ||
      typeof candidate.enabled !== "boolean" ||
      !isValidTimeLimitMinutes(candidate.limitMinutes) ||
      !isFiniteNumber(candidate.createdAt) ||
      !(candidate.bypassUntil === null || isFiniteNumber(candidate.bypassUntil))
    ) {
      changed = true;
      continue;
    }

    let domain: string;

    try {
      domain = normalizeDomain(candidate.domain);
    } catch {
      changed = true;
      continue;
    }

    if (seenDomains.has(domain)) {
      changed = true;
      continue;
    }

    const id =
      typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id
        : `limit-${domain}-${candidate.createdAt}`;

    const schedule = normalizeSchedule(candidate.schedule);

    timeLimitedDomains.push({
      id,
      domain,
      enabled: candidate.enabled,
      limitMinutes: candidate.limitMinutes,
      schedule: schedule.schedule,
      createdAt: candidate.createdAt,
      bypassUntil: candidate.bypassUntil
    });
    seenDomains.add(domain);

    changed ||= id !== candidate.id || domain !== candidate.domain || schedule.changed;
  }

  return { timeLimitedDomains, changed };
}

function normalizeIgnoredDomains(value: unknown): {
  ignoredDomains: string[];
  changed: boolean;
} {
  if (!Array.isArray(value)) {
    return { ignoredDomains: [], changed: true };
  }

  const seenDomains = new Set<string>();
  const ignoredDomains: string[] = [];
  let changed = false;

  for (const candidate of value) {
    if (typeof candidate !== "string") {
      changed = true;
      continue;
    }

    let domain: string;

    try {
      domain = normalizeDomain(candidate);
    } catch {
      changed = true;
      continue;
    }

    if (seenDomains.has(domain)) {
      changed = true;
      continue;
    }

    ignoredDomains.push(domain);
    seenDomains.add(domain);
    changed ||= domain !== candidate;
  }

  return { ignoredDomains, changed };
}

function normalizeStoredSettings(value: unknown, now: number): NormalizedSettingsResult {
  if (!isPlainObject(value)) {
    return { settings: null, changed: false };
  }

  if (value.schemaVersion !== 1) {
    return { settings: null, changed: false };
  }

  const blocked = normalizeBlockedDomains(value.blockedDomains);
  const limited = normalizeTimeLimitedDomains(value.timeLimitedDomains);
  const ignored = normalizeIgnoredDomains(value.ignoredDomains);
  const trackingEnabled = typeof value.trackingEnabled === "boolean" ? value.trackingEnabled : true;
  const idleThresholdSeconds = isValidIdleThreshold(value.idleThresholdSeconds)
    ? value.idleThresholdSeconds
    : DEFAULT_IDLE_THRESHOLD_SECONDS;
  const showBlockedAttemptCount =
    typeof value.showBlockedAttemptCount === "boolean" ? value.showBlockedAttemptCount : true;
  const createdAt = isFiniteNumber(value.createdAt) ? value.createdAt : now;
  const updatedAt = isFiniteNumber(value.updatedAt) ? value.updatedAt : now;
  const changed =
    blocked.changed ||
    limited.changed ||
    ignored.changed ||
    trackingEnabled !== value.trackingEnabled ||
    idleThresholdSeconds !== value.idleThresholdSeconds ||
    showBlockedAttemptCount !== value.showBlockedAttemptCount ||
    createdAt !== value.createdAt ||
    updatedAt !== value.updatedAt;

  return {
    settings: {
      schemaVersion: 1,
      trackingEnabled,
      idleThresholdSeconds,
      blockedDomains: blocked.blockedDomains,
      timeLimitedDomains: limited.timeLimitedDomains,
      ignoredDomains: ignored.ignoredDomains,
      showBlockedAttemptCount,
      createdAt,
      updatedAt
    },
    changed
  };
}

export class SettingsStore {
  constructor(private readonly storageArea: StorageArea = extensionBrowser.storage.local) {}

  async initializeDefaults(now = Date.now()): Promise<ExtensionSettings> {
    return (await this.migrateStoredSettings(now)).settings;
  }

  async migrateStoredSettings(now = Date.now()): Promise<SettingsMigrationResult> {
    const result = (await this.storageArea.get(SETTINGS_STORAGE_KEY)) as Record<string, unknown>;
    const value = result[SETTINGS_STORAGE_KEY];
    const normalized = normalizeStoredSettings(value, now);

    if (!normalized.settings) {
      const settings = createDefaultSettings(now);
      await this.save(settings);
      return { settings, created: true, changed: true };
    }

    if (!normalized.changed) {
      return { settings: normalized.settings, created: false, changed: false };
    }

    const settings = {
      ...normalized.settings,
      updatedAt: now
    };
    await this.save(settings);
    return { settings, created: false, changed: true };
  }

  async get(now = Date.now()): Promise<ExtensionSettings> {
    return (await this.getNullable(now)) ?? (await this.initializeDefaults(now));
  }

  async update(
    changes: Partial<
      Pick<
        ExtensionSettings,
        "trackingEnabled" | "idleThresholdSeconds" | "showBlockedAttemptCount" | "ignoredDomains"
      >
    >,
    now = Date.now()
  ): Promise<ExtensionSettings> {
    const current = await this.get(now);
    const next: ExtensionSettings = {
      ...current,
      ...changes,
      idleThresholdSeconds: isValidIdleThreshold(changes.idleThresholdSeconds)
        ? changes.idleThresholdSeconds
        : current.idleThresholdSeconds,
      updatedAt: now
    };

    await this.save(next);
    return next;
  }

  async addBlockedDomain(
    input: string,
    now = Date.now(),
    scheduleInput: ScheduleConfig = ALWAYS_SCHEDULE
  ): Promise<BlockedDomain> {
    const domain = normalizeDomain(input);
    const settings = await this.get(now);

    if (settings.blockedDomains.some((blocked) => blocked.domain === domain)) {
      throw new Error(`${domain} is already blocked.`);
    }

    const blockedDomain: BlockedDomain = {
      id: createBlockedDomainId(
        domain,
        now,
        new Set(settings.blockedDomains.map((blocked) => blocked.id))
      ),
      domain,
      enabled: true,
      schedule: normalizeSchedule(scheduleInput).schedule,
      createdAt: now
    };

    await this.save({
      ...settings,
      blockedDomains: [...settings.blockedDomains, blockedDomain],
      updatedAt: now
    });

    return blockedDomain;
  }

  async removeBlockedDomain(id: string, now = Date.now()): Promise<void> {
    const settings = await this.get(now);
    await this.save({
      ...settings,
      blockedDomains: settings.blockedDomains.filter((blocked) => blocked.id !== id),
      updatedAt: now
    });
  }

  async setBlockedDomainEnabled(id: string, enabled: boolean, now = Date.now()): Promise<void> {
    const settings = await this.get(now);
    await this.save({
      ...settings,
      blockedDomains: settings.blockedDomains.map((blocked) =>
        blocked.id === id ? { ...blocked, enabled } : blocked
      ),
      updatedAt: now
    });
  }

  async updateBlockedDomain(
    id: string,
    input: string,
    scheduleInput: ScheduleConfig,
    now = Date.now()
  ): Promise<void> {
    const domain = normalizeDomain(input);
    const settings = await this.get(now);

    if (!settings.blockedDomains.some((blocked) => blocked.id === id)) {
      throw new Error("Blocked domain not found.");
    }

    if (settings.blockedDomains.some((blocked) => blocked.id !== id && blocked.domain === domain)) {
      throw new Error(`${domain} is already blocked.`);
    }

    const schedule = normalizeSchedule(scheduleInput).schedule;
    await this.save({
      ...settings,
      blockedDomains: settings.blockedDomains.map((blocked) =>
        blocked.id === id ? { ...blocked, domain, schedule } : blocked
      ),
      updatedAt: now
    });
  }

  async updateBlockedDomainSchedule(
    id: string,
    scheduleInput: ScheduleConfig,
    now = Date.now()
  ): Promise<void> {
    const settings = await this.get(now);
    const schedule = normalizeSchedule(scheduleInput).schedule;
    await this.save({
      ...settings,
      blockedDomains: settings.blockedDomains.map((blocked) =>
        blocked.id === id ? { ...blocked, schedule } : blocked
      ),
      updatedAt: now
    });
  }

  async getEnabledBlockedDomains(now = Date.now()): Promise<BlockedDomain[]> {
    const settings = await this.get(now);
    return settings.blockedDomains.filter((blocked) => blocked.enabled);
  }

  async addTimeLimitedDomain(
    input: string,
    limitMinutes: number,
    now = Date.now(),
    scheduleInput: ScheduleConfig = ALWAYS_SCHEDULE
  ): Promise<TimeLimitedDomain> {
    if (!isValidTimeLimitMinutes(limitMinutes)) {
      throw new Error("Choose a supported time limit.");
    }

    const domain = normalizeDomain(input);
    const settings = await this.get(now);

    if (settings.timeLimitedDomains.some((limited) => limited.domain === domain)) {
      throw new Error(`${domain} already has a time limit.`);
    }

    const timeLimitedDomain: TimeLimitedDomain = {
      id: createTimeLimitedDomainId(
        domain,
        now,
        new Set(settings.timeLimitedDomains.map((limited) => limited.id))
      ),
      domain,
      enabled: true,
      limitMinutes,
      schedule: normalizeSchedule(scheduleInput).schedule,
      createdAt: now,
      bypassUntil: null
    };

    await this.save({
      ...settings,
      timeLimitedDomains: [...settings.timeLimitedDomains, timeLimitedDomain],
      updatedAt: now
    });

    return timeLimitedDomain;
  }

  async removeTimeLimitedDomain(id: string, now = Date.now()): Promise<void> {
    const settings = await this.get(now);
    await this.save({
      ...settings,
      timeLimitedDomains: settings.timeLimitedDomains.filter((limited) => limited.id !== id),
      updatedAt: now
    });
  }

  async setTimeLimitedDomainEnabled(id: string, enabled: boolean, now = Date.now()): Promise<void> {
    const settings = await this.get(now);
    await this.save({
      ...settings,
      timeLimitedDomains: settings.timeLimitedDomains.map((limited) =>
        limited.id === id ? { ...limited, enabled } : limited
      ),
      updatedAt: now
    });
  }

  async updateTimeLimitedDomain(
    id: string,
    limitMinutes: number,
    scheduleInput?: ScheduleConfig,
    now = Date.now(),
    input?: string
  ): Promise<void> {
    if (!isValidTimeLimitMinutes(limitMinutes)) {
      throw new Error("Choose a supported time limit.");
    }

    const settings = await this.get(now);
    const domain = input ? normalizeDomain(input) : null;

    if (!settings.timeLimitedDomains.some((limited) => limited.id === id)) {
      throw new Error("Time limit not found.");
    }

    if (
      domain &&
      settings.timeLimitedDomains.some((limited) => limited.id !== id && limited.domain === domain)
    ) {
      throw new Error(`${domain} already has a time limit.`);
    }

    await this.save({
      ...settings,
      timeLimitedDomains: settings.timeLimitedDomains.map((limited) =>
        limited.id === id
          ? {
              ...limited,
              domain: domain ?? limited.domain,
              limitMinutes,
              schedule: scheduleInput
                ? normalizeSchedule(scheduleInput).schedule
                : limited.schedule,
              bypassUntil: null
            }
          : limited
      ),
      updatedAt: now
    });
  }

  async setTimeLimitBypass(
    domainInput: string,
    bypassUntil: number,
    now = Date.now()
  ): Promise<void> {
    const domain = normalizeDomain(domainInput);
    const settings = await this.get(now);
    const existing = settings.timeLimitedDomains.find(
      (limited) => limited.enabled && limited.domain === domain
    );

    if (!existing) {
      throw new Error("This domain does not currently have an active time limit.");
    }

    await this.save({
      ...settings,
      timeLimitedDomains: settings.timeLimitedDomains.map((limited) =>
        limited.domain === domain ? { ...limited, bypassUntil } : limited
      ),
      updatedAt: now
    });
  }

  async clearExpiredTimeLimitBypasses(now = Date.now()): Promise<ExtensionSettings> {
    const settings = await this.get(now);
    const nextLimitedDomains = settings.timeLimitedDomains.map((limited) =>
      limited.bypassUntil !== null && limited.bypassUntil <= now
        ? { ...limited, bypassUntil: null }
        : limited
    );
    const changed = nextLimitedDomains.some(
      (limited, index) => limited.bypassUntil !== settings.timeLimitedDomains[index]?.bypassUntil
    );

    if (!changed) {
      return settings;
    }

    const next = {
      ...settings,
      timeLimitedDomains: nextLimitedDomains,
      updatedAt: now
    };
    await this.save(next);
    return next;
  }

  async getEnabledTimeLimitedDomains(now = Date.now()): Promise<TimeLimitedDomain[]> {
    const settings = await this.get(now);
    return settings.timeLimitedDomains.filter((limited) => limited.enabled);
  }

  async save(settings: ExtensionSettings): Promise<void> {
    await this.storageArea.set({ [SETTINGS_STORAGE_KEY]: settings });
  }

  private async getNullable(now = Date.now()): Promise<ExtensionSettings | null> {
    const result = (await this.storageArea.get(SETTINGS_STORAGE_KEY)) as Record<string, unknown>;
    const value = result[SETTINGS_STORAGE_KEY];
    return normalizeStoredSettings(value, now).settings;
  }
}
