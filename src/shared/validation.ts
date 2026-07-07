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
    value === 60 ||
    value === 120
  );
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}
