import type { BlockAttempt, UsageSession } from "@/shared/types";
import { getDateKey, startOfLocalDay, startOfLocalWeek } from "@/shared/time";
import type { DomainCategory, DomainClassification } from "../types";
import {
  isBridgeCategory,
  isDistractionCategory,
  isProductiveCategory
} from "../classification/categoryTypes";

export const VISION_CONTINUOUS_GAP_MS = 15 * 60 * 1000;
export const VISION_PATHWAY_WINDOW_MS = 2 * 60 * 60 * 1000;
export const VISION_RECOVERY_WINDOW_MS = 3 * 60 * 60 * 1000;

export function hourOf(timestamp: number): number {
  return new Date(timestamp).getHours();
}

export function dayOfWeekOf(timestamp: number): number {
  return new Date(timestamp).getDay();
}

export function weekStart(timestamp: number): number {
  return startOfLocalWeek(timestamp);
}

export function monthStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export function classificationCategory(
  classifications: Map<string, DomainClassification | null>,
  domain: string
): DomainCategory | null {
  return classifications.get(domain)?.primaryCategory ?? null;
}

export function categoryKind(
  category: DomainCategory | null
): "focus" | "bridge" | "distraction" | "other" {
  if (isProductiveCategory(category)) {
    return "focus";
  }

  if (isBridgeCategory(category)) {
    return "bridge";
  }

  if (isDistractionCategory(category)) {
    return "distraction";
  }

  return "other";
}

export function sortSessionsAscending(sessions: UsageSession[]): UsageSession[] {
  return [...sessions].sort((a, b) => a.startedAt - b.startedAt);
}

export function compactCountMap<T extends string>(items: T[]): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>();

  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function sessionsSince(sessions: UsageSession[], now: number, days: number): UsageSession[] {
  const start = startOfLocalDay(now) - (days - 1) * 24 * 60 * 60 * 1000;
  return sessions.filter((session) => session.endedAt >= start && session.startedAt <= now);
}

export function attemptsSince(attempts: BlockAttempt[], now: number, days: number): BlockAttempt[] {
  const start = startOfLocalDay(now) - (days - 1) * 24 * 60 * 60 * 1000;
  return attempts.filter((attempt) => attempt.attemptedAt >= start && attempt.attemptedAt <= now);
}

export function localDateKey(timestamp: number): string {
  return getDateKey(timestamp);
}
