import type { ExtensionSettings } from "./types";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidIdleThreshold(
  value: unknown
): value is ExtensionSettings["idleThresholdSeconds"] {
  return value === 30 || value === 60 || value === 120 || value === 300;
}

export function isValidTimeLimitMinutes(value: unknown): value is number {
  return (
    value === 1 ||
    value === 5 ||
    value === 10 ||
    value === 15 ||
    value === 30 ||
    value === 45 ||
    value === 60 ||
    value === 90 ||
    value === 120 ||
    value === 150 ||
    value === 180 ||
    value === 210 ||
    value === 240 ||
    value === 270 ||
    value === 300
  );
}

export function isValidHistoryRetentionDays(
  value: unknown
): value is ExtensionSettings["historyRetentionDays"] {
  return value === 30 || value === 90 || value === 180 || value === 365 || value === null;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}
