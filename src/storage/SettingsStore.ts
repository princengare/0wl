import { normalizeDomain } from "@/shared/domain";
import { SETTINGS_STORAGE_KEY, createDefaultSettings } from "./defaults";
import { ALWAYS_SCHEDULE, normalizeSchedule } from "@/shared/schedule";
import { browser as extensionBrowser } from "@/shared/browser";
import { normalizeWindowScope } from "@/platform/windowScope";
import type {
  BlockedDomain,
  ExtensionSettings,
  ScheduleConfig,
  ScheduledBreakRule,
  TimeLimitedDomain,
  TimeLimitTargetType,
  WindowScope
} from "@/shared/types";
import {
  DEFAULT_IDLE_THRESHOLD_SECONDS,
  DEFAULT_SCHEDULED_BREAK_DURATION_MINUTES
} from "@/shared/constants";
import {
  isPlainObject,
  isValidHistoryRetentionDays,
  isValidIdleThreshold,
  isValidTimeLimitMinutes
} from "@/shared/validation";

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

function createTimeLimitedDomainId(
  targetKey: string,
  now: number,
  existingIds: Set<string>
): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    const id = crypto.randomUUID();
    if (!existingIds.has(id)) {
      return id;
    }
  }

  return `limit-${targetKey}-${now}`;
}

function createScheduledBreakRuleId(
  windowScope: WindowScope,
  now: number,
  existingIds: Set<string>
): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    const id = crypto.randomUUID();
    if (!existingIds.has(id)) {
      return id;
    }
  }

  return `break-${windowScope}-${now}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scopedDomainKey(domain: string, windowScope: WindowScope): string {
  return `${windowScope}::${domain}`;
}

function timeLimitTargetKey(
  targetType: TimeLimitTargetType,
  domain: string | null,
  windowScope: WindowScope
): string {
  return `${windowScope}::${targetType}::${domain ?? "all-browsing"}`;
}

function globalLimitLabel(windowScope: WindowScope): string {
  return windowScope === "private" ? "All Private Browsing" : "All Browsing";
}

function isAllowedTimeLimitMinutesForScope(
  limitMinutes: unknown,
  windowScope: WindowScope
): limitMinutes is number {
  return isValidTimeLimitMinutes(limitMinutes) && (limitMinutes > 0 || windowScope === "private");
}

function isValidBreakAfterMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 24 * 60;
}

function isValidBreakDurationMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 60;
}

function resolveTimeLimitInput(input: string): {
  targetType: TimeLimitTargetType;
  domain: string | null;
} {
  if (input.trim().length === 0) {
    return {
      targetType: "global",
      domain: null
    };
  }

  return {
    targetType: "domain",
    domain: normalizeDomain(input)
  };
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
    const windowScope = normalizeWindowScope(candidate.windowScope);

    try {
      domain = normalizeDomain(candidate.domain);
    } catch {
      changed = true;
      continue;
    }

    const key = scopedDomainKey(domain, windowScope);

    if (seenDomains.has(key)) {
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
      windowScope,
      enabled: candidate.enabled,
      schedule: schedule.schedule,
      createdAt: candidate.createdAt
    });
    seenDomains.add(key);

    changed ||=
      id !== candidate.id ||
      domain !== candidate.domain ||
      windowScope !== candidate.windowScope ||
      schedule.changed;
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

  const seenTargets = new Set<string>();
  const timeLimitedDomains: TimeLimitedDomain[] = [];
  let changed = false;

  for (const candidate of value) {
    if (
      !isPlainObject(candidate) ||
      typeof candidate.enabled !== "boolean" ||
      !isFiniteNumber(candidate.createdAt) ||
      !(candidate.bypassUntil === null || isFiniteNumber(candidate.bypassUntil))
    ) {
      changed = true;
      continue;
    }

    let domain: string | null = null;
    const targetType: TimeLimitTargetType = candidate.targetType === "global" ? "global" : "domain";
    const windowScope = normalizeWindowScope(candidate.windowScope);

    if (!isAllowedTimeLimitMinutesForScope(candidate.limitMinutes, windowScope)) {
      changed = true;
      continue;
    }

    try {
      if (targetType === "domain") {
        if (typeof candidate.domain !== "string") {
          changed = true;
          continue;
        }

        domain = normalizeDomain(candidate.domain);
      }
    } catch {
      changed = true;
      continue;
    }

    const key = timeLimitTargetKey(targetType, domain, windowScope);

    if (seenTargets.has(key)) {
      changed = true;
      continue;
    }

    const id =
      typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id
        : `limit-${key}-${candidate.createdAt}`;

    const schedule = normalizeSchedule(candidate.schedule);

    timeLimitedDomains.push({
      id,
      domain,
      targetType,
      windowScope,
      enabled: candidate.enabled,
      limitMinutes: candidate.limitMinutes,
      schedule: schedule.schedule,
      createdAt: candidate.createdAt,
      bypassUntil: candidate.bypassUntil
    });
    seenTargets.add(key);

    changed ||=
      id !== candidate.id ||
      domain !== candidate.domain ||
      targetType !== candidate.targetType ||
      windowScope !== candidate.windowScope ||
      schedule.changed;
  }

  return { timeLimitedDomains, changed };
}

function normalizeScheduledBreakRules(value: unknown): {
  scheduledBreakRules: ScheduledBreakRule[];
  changed: boolean;
} {
  if (!Array.isArray(value)) {
    return { scheduledBreakRules: [], changed: true };
  }

  const seenScopes = new Set<WindowScope>();
  const scheduledBreakRules: ScheduledBreakRule[] = [];
  let changed = false;

  for (const candidate of value) {
    if (
      !isPlainObject(candidate) ||
      typeof candidate.enabled !== "boolean" ||
      !isFiniteNumber(candidate.createdAt)
    ) {
      changed = true;
      continue;
    }

    const windowScope = normalizeWindowScope(candidate.windowScope);

    if (!isValidBreakAfterMinutes(candidate.breakAfterMinutes)) {
      changed = true;
      continue;
    }

    const breakDurationMinutes = isValidBreakDurationMinutes(candidate.breakDurationMinutes)
      ? candidate.breakDurationMinutes
      : DEFAULT_SCHEDULED_BREAK_DURATION_MINUTES;

    if (seenScopes.has(windowScope)) {
      changed = true;
      continue;
    }

    const id =
      typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id
        : `break-${windowScope}-${candidate.createdAt}`;
    const schedule = normalizeSchedule(candidate.schedule);
    const updatedAt = isFiniteNumber(candidate.updatedAt)
      ? candidate.updatedAt
      : candidate.createdAt;

    scheduledBreakRules.push({
      id,
      enabled: candidate.enabled,
      windowScope,
      breakAfterMinutes: candidate.breakAfterMinutes,
      breakDurationMinutes,
      schedule: schedule.schedule,
      createdAt: candidate.createdAt,
      updatedAt
    });
    seenScopes.add(windowScope);

    changed ||=
      id !== candidate.id ||
      windowScope !== candidate.windowScope ||
      breakDurationMinutes !== candidate.breakDurationMinutes ||
      updatedAt !== candidate.updatedAt ||
      schedule.changed;
  }

  return { scheduledBreakRules, changed };
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
  const breaks = normalizeScheduledBreakRules(value.scheduledBreakRules);
  const ignored = normalizeIgnoredDomains(value.ignoredDomains);
  const trackingEnabled = typeof value.trackingEnabled === "boolean" ? value.trackingEnabled : true;
  const privateBrowserTrackingEnabled =
    typeof value.privateBrowserTrackingEnabled === "boolean"
      ? value.privateBrowserTrackingEnabled
      : false;
  const idleThresholdSeconds = isValidIdleThreshold(value.idleThresholdSeconds)
    ? value.idleThresholdSeconds
    : DEFAULT_IDLE_THRESHOLD_SECONDS;
  const showBlockedAttemptCount =
    typeof value.showBlockedAttemptCount === "boolean" ? value.showBlockedAttemptCount : true;
  const historyRetentionDays = isValidHistoryRetentionDays(value.historyRetentionDays)
    ? value.historyRetentionDays
    : null;
  const createdAt = isFiniteNumber(value.createdAt) ? value.createdAt : now;
  const updatedAt = isFiniteNumber(value.updatedAt) ? value.updatedAt : now;
  const changed =
    blocked.changed ||
    limited.changed ||
    breaks.changed ||
    ignored.changed ||
    trackingEnabled !== value.trackingEnabled ||
    privateBrowserTrackingEnabled !== value.privateBrowserTrackingEnabled ||
    idleThresholdSeconds !== value.idleThresholdSeconds ||
    showBlockedAttemptCount !== value.showBlockedAttemptCount ||
    historyRetentionDays !== value.historyRetentionDays ||
    createdAt !== value.createdAt ||
    updatedAt !== value.updatedAt;

  return {
    settings: {
      schemaVersion: 1,
      trackingEnabled,
      privateBrowserTrackingEnabled,
      idleThresholdSeconds,
      blockedDomains: blocked.blockedDomains,
      timeLimitedDomains: limited.timeLimitedDomains,
      scheduledBreakRules: breaks.scheduledBreakRules,
      ignoredDomains: ignored.ignoredDomains,
      showBlockedAttemptCount,
      historyRetentionDays,
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
        | "trackingEnabled"
        | "privateBrowserTrackingEnabled"
        | "idleThresholdSeconds"
        | "showBlockedAttemptCount"
        | "ignoredDomains"
        | "historyRetentionDays"
      >
    >,
    now = Date.now()
  ): Promise<ExtensionSettings> {
    const current = await this.get(now);
    const next: ExtensionSettings = {
      ...current,
      trackingEnabled:
        typeof changes.trackingEnabled === "boolean"
          ? changes.trackingEnabled
          : current.trackingEnabled,
      privateBrowserTrackingEnabled:
        typeof changes.privateBrowserTrackingEnabled === "boolean"
          ? changes.privateBrowserTrackingEnabled
          : current.privateBrowserTrackingEnabled,
      idleThresholdSeconds: isValidIdleThreshold(changes.idleThresholdSeconds)
        ? changes.idleThresholdSeconds
        : current.idleThresholdSeconds,
      ignoredDomains: changes.ignoredDomains ?? current.ignoredDomains,
      showBlockedAttemptCount:
        typeof changes.showBlockedAttemptCount === "boolean"
          ? changes.showBlockedAttemptCount
          : current.showBlockedAttemptCount,
      historyRetentionDays: isValidHistoryRetentionDays(changes.historyRetentionDays)
        ? changes.historyRetentionDays
        : current.historyRetentionDays,
      updatedAt: now
    };

    await this.save(next);
    return next;
  }

  async addScheduledBreakRule(
    breakAfterMinutes: number,
    now = Date.now(),
    scheduleInput: ScheduleConfig = ALWAYS_SCHEDULE,
    windowScopeInput: WindowScope = "regular",
    breakDurationMinutes = DEFAULT_SCHEDULED_BREAK_DURATION_MINUTES
  ): Promise<ScheduledBreakRule> {
    const windowScope = normalizeWindowScope(windowScopeInput);

    if (!isValidBreakAfterMinutes(breakAfterMinutes)) {
      throw new Error("Choose a supported break threshold.");
    }

    if (!isValidBreakDurationMinutes(breakDurationMinutes)) {
      throw new Error("Choose a break duration from 1 minute to 1 hour.");
    }

    const settings = await this.get(now);

    if (settings.scheduledBreakRules.some((rule) => rule.windowScope === windowScope)) {
      throw new Error(
        windowScope === "private"
          ? "Private Windows already have a scheduled break."
          : "Regular Windows already have a scheduled break."
      );
    }

    const rule: ScheduledBreakRule = {
      id: createScheduledBreakRuleId(
        windowScope,
        now,
        new Set(settings.scheduledBreakRules.map((candidate) => candidate.id))
      ),
      enabled: true,
      windowScope,
      breakAfterMinutes,
      breakDurationMinutes,
      schedule: normalizeSchedule(scheduleInput).schedule,
      createdAt: now,
      updatedAt: now
    };

    await this.save({
      ...settings,
      scheduledBreakRules: [...settings.scheduledBreakRules, rule],
      updatedAt: now
    });

    return rule;
  }

  async removeScheduledBreakRule(id: string, now = Date.now()): Promise<void> {
    const settings = await this.get(now);
    await this.save({
      ...settings,
      scheduledBreakRules: settings.scheduledBreakRules.filter((rule) => rule.id !== id),
      updatedAt: now
    });
  }

  async setScheduledBreakRuleEnabled(
    id: string,
    enabled: boolean,
    now = Date.now()
  ): Promise<void> {
    const settings = await this.get(now);
    await this.save({
      ...settings,
      scheduledBreakRules: settings.scheduledBreakRules.map((rule) =>
        rule.id === id ? { ...rule, enabled, updatedAt: now } : rule
      ),
      updatedAt: now
    });
  }

  async updateScheduledBreakRule(
    id: string,
    breakAfterMinutes: number,
    scheduleInput: ScheduleConfig = ALWAYS_SCHEDULE,
    now = Date.now(),
    windowScopeInput?: WindowScope,
    breakDurationMinutes?: number
  ): Promise<void> {
    if (!isValidBreakAfterMinutes(breakAfterMinutes)) {
      throw new Error("Choose a supported break threshold.");
    }

    const settings = await this.get(now);
    const existing = settings.scheduledBreakRules.find((rule) => rule.id === id);

    if (!existing) {
      throw new Error("Scheduled break not found.");
    }

    const nextBreakDurationMinutes = breakDurationMinutes ?? existing.breakDurationMinutes;

    if (!isValidBreakDurationMinutes(nextBreakDurationMinutes)) {
      throw new Error("Choose a break duration from 1 minute to 1 hour.");
    }

    const windowScope = normalizeWindowScope(windowScopeInput ?? existing.windowScope);

    if (
      settings.scheduledBreakRules.some(
        (rule) => rule.id !== id && rule.windowScope === windowScope
      )
    ) {
      throw new Error(
        windowScope === "private"
          ? "Private Windows already have a scheduled break."
          : "Regular Windows already have a scheduled break."
      );
    }

    await this.save({
      ...settings,
      scheduledBreakRules: settings.scheduledBreakRules.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              windowScope,
              breakAfterMinutes,
              breakDurationMinutes: nextBreakDurationMinutes,
              schedule: normalizeSchedule(scheduleInput).schedule,
              updatedAt: now
            }
          : rule
      ),
      updatedAt: now
    });
  }

  async addBlockedDomain(
    input: string,
    now = Date.now(),
    scheduleInput: ScheduleConfig = ALWAYS_SCHEDULE,
    windowScopeInput: WindowScope = "regular"
  ): Promise<BlockedDomain> {
    const domain = normalizeDomain(input);
    const windowScope = normalizeWindowScope(windowScopeInput);
    const settings = await this.get(now);

    if (
      settings.blockedDomains.some(
        (blocked) => blocked.domain === domain && blocked.windowScope === windowScope
      )
    ) {
      throw new Error(`${domain} is already blocked.`);
    }

    const blockedDomain: BlockedDomain = {
      id: createBlockedDomainId(
        domain,
        now,
        new Set(settings.blockedDomains.map((blocked) => blocked.id))
      ),
      domain,
      windowScope,
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
    now = Date.now(),
    windowScopeInput?: WindowScope
  ): Promise<void> {
    const domain = normalizeDomain(input);
    const settings = await this.get(now);
    const existing = settings.blockedDomains.find((blocked) => blocked.id === id);

    if (!existing) {
      throw new Error("Blocked domain not found.");
    }

    const windowScope = normalizeWindowScope(windowScopeInput ?? existing.windowScope);

    if (
      settings.blockedDomains.some(
        (blocked) =>
          blocked.id !== id && blocked.domain === domain && blocked.windowScope === windowScope
      )
    ) {
      throw new Error(`${domain} is already blocked.`);
    }

    const schedule = normalizeSchedule(scheduleInput).schedule;
    await this.save({
      ...settings,
      blockedDomains: settings.blockedDomains.map((blocked) =>
        blocked.id === id ? { ...blocked, domain, windowScope, schedule } : blocked
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

  async getEnabledBlockedDomains(
    now = Date.now(),
    windowScope?: WindowScope
  ): Promise<BlockedDomain[]> {
    const settings = await this.get(now);
    return settings.blockedDomains.filter(
      (blocked) => blocked.enabled && (!windowScope || blocked.windowScope === windowScope)
    );
  }

  async addTimeLimitedDomain(
    input: string,
    limitMinutes: number,
    now = Date.now(),
    scheduleInput: ScheduleConfig = ALWAYS_SCHEDULE,
    windowScopeInput: WindowScope = "regular"
  ): Promise<TimeLimitedDomain> {
    const windowScope = normalizeWindowScope(windowScopeInput);

    if (!isAllowedTimeLimitMinutesForScope(limitMinutes, windowScope)) {
      throw new Error("Choose a supported time limit.");
    }

    const { targetType, domain } = resolveTimeLimitInput(input);
    const settings = await this.get(now);
    const targetKey = timeLimitTargetKey(targetType, domain, windowScope);
    const label = domain ?? globalLimitLabel(windowScope);

    if (
      settings.timeLimitedDomains.some(
        (limited) =>
          timeLimitTargetKey(limited.targetType, limited.domain, limited.windowScope) === targetKey
      )
    ) {
      throw new Error(`${label} already has a time limit.`);
    }

    const timeLimitedDomain: TimeLimitedDomain = {
      id: createTimeLimitedDomainId(
        targetKey,
        now,
        new Set(settings.timeLimitedDomains.map((limited) => limited.id))
      ),
      domain,
      targetType,
      windowScope,
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
    input?: string,
    windowScopeInput?: WindowScope
  ): Promise<void> {
    const settings = await this.get(now);
    const existing = settings.timeLimitedDomains.find((limited) => limited.id === id);

    if (!existing) {
      throw new Error("Time limit not found.");
    }

    const windowScope = normalizeWindowScope(windowScopeInput ?? existing.windowScope);

    if (!isAllowedTimeLimitMinutesForScope(limitMinutes, windowScope)) {
      throw new Error("Choose a supported time limit.");
    }

    const resolved =
      input === undefined
        ? { targetType: existing.targetType, domain: existing.domain }
        : resolveTimeLimitInput(input);
    const targetKey = timeLimitTargetKey(resolved.targetType, resolved.domain, windowScope);
    const label = resolved.domain ?? globalLimitLabel(windowScope);

    if (
      settings.timeLimitedDomains.some(
        (limited) =>
          limited.id !== id &&
          timeLimitTargetKey(limited.targetType, limited.domain, limited.windowScope) === targetKey
      )
    ) {
      throw new Error(`${label} already has a time limit.`);
    }

    await this.save({
      ...settings,
      timeLimitedDomains: settings.timeLimitedDomains.map((limited) =>
        limited.id === id
          ? {
              ...limited,
              domain: resolved.domain,
              targetType: resolved.targetType,
              windowScope,
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
    domainInput: string | undefined,
    bypassUntil: number,
    now = Date.now(),
    targetTypeInput: TimeLimitTargetType = "domain",
    windowScopeInput: WindowScope = "regular"
  ): Promise<void> {
    const { targetType, domain } =
      targetTypeInput === "global"
        ? { targetType: "global" as const, domain: null }
        : resolveTimeLimitInput(domainInput ?? "");
    const windowScope = normalizeWindowScope(windowScopeInput);
    const settings = await this.get(now);
    const existing = settings.timeLimitedDomains.find(
      (limited) =>
        limited.enabled &&
        limited.targetType === targetType &&
        limited.domain === domain &&
        limited.windowScope === windowScope
    );

    if (!existing) {
      throw new Error("This domain does not currently have an active time limit.");
    }

    await this.save({
      ...settings,
      timeLimitedDomains: settings.timeLimitedDomains.map((limited) =>
        limited.id === existing.id ? { ...limited, bypassUntil } : limited
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

  async getEnabledTimeLimitedDomains(
    now = Date.now(),
    windowScope?: WindowScope
  ): Promise<TimeLimitedDomain[]> {
    const settings = await this.get(now);
    return settings.timeLimitedDomains.filter(
      (limited) => limited.enabled && (!windowScope || limited.windowScope === windowScope)
    );
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
