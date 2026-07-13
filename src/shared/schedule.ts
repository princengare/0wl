import type { CustomSchedule, DayOfWeek, ScheduleConfig } from "./types";
import { startOfLocalDay } from "./time";
import { isPlainObject } from "./validation";

export const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: DayOfWeek[] = [1, 2, 3, 4, 5];
export const WEEKENDS: DayOfWeek[] = [0, 6];

export interface ScheduleInterval {
  start: number;
  end: number;
}

export const ALWAYS_SCHEDULE: ScheduleConfig = { mode: "always" };

function isValidMinuteOfDay(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1439;
}

function normalizeDays(value: unknown): DayOfWeek[] {
  if (!Array.isArray(value)) {
    return ALL_DAYS;
  }

  const unique = [...new Set(value)].filter(
    (day): day is DayOfWeek => Number.isInteger(day) && day >= 0 && day <= 6
  );

  return unique.length > 0 ? unique.sort((a, b) => a - b) : ALL_DAYS;
}

export function normalizeSchedule(value: unknown): {
  schedule: ScheduleConfig;
  changed: boolean;
} {
  if (value === undefined || value === null) {
    return { schedule: ALWAYS_SCHEDULE, changed: true };
  }

  if (!isPlainObject(value)) {
    return { schedule: ALWAYS_SCHEDULE, changed: true };
  }

  if (value.mode === "always") {
    return { schedule: ALWAYS_SCHEDULE, changed: false };
  }

  if (value.mode !== "custom") {
    return { schedule: ALWAYS_SCHEDULE, changed: true };
  }

  const daysOfWeek = normalizeDays(value.daysOfWeek);
  const startMinutes = isValidMinuteOfDay(value.startMinutes) ? value.startMinutes : 9 * 60;
  const endMinutes = isValidMinuteOfDay(value.endMinutes) ? value.endMinutes : 17 * 60;
  const rawDays = Array.isArray(value.daysOfWeek) ? value.daysOfWeek : [];
  const schedule: CustomSchedule = {
    mode: "custom",
    daysOfWeek,
    startMinutes,
    endMinutes
  };

  return {
    schedule,
    changed:
      daysOfWeek.length !== rawDays.length ||
      daysOfWeek.some((day, index) => day !== rawDays[index]) ||
      startMinutes !== value.startMinutes ||
      endMinutes !== value.endMinutes
  };
}

export function minutesSinceLocalMidnight(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

export function previousDay(day: DayOfWeek): DayOfWeek {
  return ((day + 6) % 7) as DayOfWeek;
}

export function isScheduleAlways(schedule: ScheduleConfig): boolean {
  return schedule.mode === "always";
}

export function isScheduleActive(schedule: ScheduleConfig, timestamp: number): boolean {
  if (schedule.mode === "always") {
    return true;
  }

  const date = new Date(timestamp);
  const day = date.getDay() as DayOfWeek;
  const minute = minutesSinceLocalMidnight(timestamp);
  const selected = new Set(schedule.daysOfWeek);

  if (schedule.startMinutes === schedule.endMinutes) {
    return selected.has(day);
  }

  if (schedule.startMinutes < schedule.endMinutes) {
    return selected.has(day) && minute >= schedule.startMinutes && minute < schedule.endMinutes;
  }

  return (
    (selected.has(day) && minute >= schedule.startMinutes) ||
    (selected.has(previousDay(day)) && minute < schedule.endMinutes)
  );
}

function intervalForStartDay(
  schedule: CustomSchedule,
  dayStart: number,
  startBoundary: number,
  endBoundary: number
): ScheduleInterval | null {
  const start = dayStart + schedule.startMinutes * 60 * 1000;
  const end =
    schedule.startMinutes === schedule.endMinutes
      ? dayStart + 24 * 60 * 60 * 1000
      : dayStart +
        schedule.endMinutes * 60 * 1000 +
        (schedule.endMinutes <= schedule.startMinutes ? 24 * 60 * 60 * 1000 : 0);
  const clippedStart = Math.max(start, startBoundary);
  const clippedEnd = Math.min(end, endBoundary);

  if (clippedEnd <= clippedStart) {
    return null;
  }

  return {
    start: clippedStart,
    end: clippedEnd
  };
}

export function getScheduleIntervalsBetween(
  schedule: ScheduleConfig,
  startBoundary: number,
  endBoundary: number
): ScheduleInterval[] {
  if (endBoundary <= startBoundary) {
    return [];
  }

  if (schedule.mode === "always") {
    return [{ start: startBoundary, end: endBoundary }];
  }

  const selected = new Set(schedule.daysOfWeek);
  const intervals: ScheduleInterval[] = [];
  let dayStart = startOfLocalDay(startBoundary) - 24 * 60 * 60 * 1000;
  const lastStart = startOfLocalDay(endBoundary) + 24 * 60 * 60 * 1000;

  while (dayStart <= lastStart) {
    const day = new Date(dayStart).getDay() as DayOfWeek;

    if (selected.has(day)) {
      const interval = intervalForStartDay(schedule, dayStart, startBoundary, endBoundary);

      if (interval) {
        intervals.push(interval);
      }
    }

    dayStart += 24 * 60 * 60 * 1000;
  }

  return intervals;
}

export function nextScheduleTransition(schedule: ScheduleConfig, now: number): number | null {
  if (schedule.mode === "always") {
    return null;
  }

  const searchEnd = now + 8 * 24 * 60 * 60 * 1000;
  const intervals = getScheduleIntervalsBetween(schedule, now - 24 * 60 * 60 * 1000, searchEnd);
  const candidates = intervals
    .flatMap((interval) => [interval.start, interval.end])
    .filter((timestamp) => timestamp > now)
    .sort((a, b) => a - b);

  return candidates[0] ?? null;
}

export function overlapDurationMs(
  start: number,
  end: number,
  intervals: ScheduleInterval[]
): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return intervals.reduce((total, interval) => {
    const overlapStart = Math.max(start, interval.start);
    const overlapEnd = Math.min(end, interval.end);
    return total + Math.max(0, overlapEnd - overlapStart);
  }, 0);
}

export function formatTimeOfDay(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 || 12;

  if (minute === 0) {
    return `${hour12}:00 ${period}`;
  }

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function sameDays(days: DayOfWeek[], expected: DayOfWeek[]): boolean {
  return days.length === expected.length && days.every((day, index) => day === expected[index]);
}

export function formatScheduleSummary(schedule: ScheduleConfig): string {
  if (schedule.mode === "always") {
    return "Always active";
  }

  const days = [...schedule.daysOfWeek].sort((a, b) => a - b);
  const dayLabel = sameDays(days, ALL_DAYS)
    ? "Every day"
    : sameDays(days, WEEKDAYS)
      ? "Weekdays"
      : sameDays(days, WEEKENDS)
        ? "Weekends"
        : days.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(" ");

  return `${dayLabel} · ${formatTimeOfDay(schedule.startMinutes)}-${formatTimeOfDay(
    schedule.endMinutes
  )}`;
}
