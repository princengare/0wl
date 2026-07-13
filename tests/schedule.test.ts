import { describe, expect, it } from "vitest";
import {
  ALL_DAYS,
  WEEKDAYS,
  WEEKENDS,
  formatScheduleSummary,
  getScheduleIntervalsBetween,
  isScheduleActive,
  nextScheduleTransition
} from "@/shared/schedule";
import type { ScheduleConfig } from "@/shared/types";

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 6, day, hour, minute, 0).getTime();
}

describe("scheduled windows", () => {
  it("is active inside a same-day schedule and inactive outside it", () => {
    const schedule: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: ALL_DAYS,
      startMinutes: 9 * 60,
      endMinutes: 17 * 60
    };

    expect(isScheduleActive(schedule, at(6, 10))).toBe(true);
    expect(isScheduleActive(schedule, at(6, 8, 59))).toBe(false);
    expect(isScheduleActive(schedule, at(6, 17))).toBe(false);
  });

  it("supports weekdays, weekends, and custom days", () => {
    const weekdays: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: WEEKDAYS,
      startMinutes: 13 * 60,
      endMinutes: 18 * 60
    };
    const weekends: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: WEEKENDS,
      startMinutes: 13 * 60,
      endMinutes: 18 * 60
    };
    const mondayOnly: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: [1],
      startMinutes: 13 * 60,
      endMinutes: 18 * 60
    };

    expect(isScheduleActive(weekdays, at(6, 14))).toBe(true);
    expect(isScheduleActive(weekdays, at(11, 14))).toBe(false);
    expect(isScheduleActive(weekends, at(11, 14))).toBe(true);
    expect(isScheduleActive(mondayOnly, at(6, 14))).toBe(true);
    expect(isScheduleActive(mondayOnly, at(7, 14))).toBe(false);
  });

  it("supports midnight-crossing schedules using the selected start day", () => {
    const schedule: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: [1],
      startMinutes: 22 * 60,
      endMinutes: 2 * 60
    };

    expect(isScheduleActive(schedule, at(6, 23))).toBe(true);
    expect(isScheduleActive(schedule, at(7, 1))).toBe(true);
    expect(isScheduleActive(schedule, at(7, 3))).toBe(false);
    expect(isScheduleActive(schedule, at(8, 1))).toBe(false);
  });

  it("returns schedule intervals and the next transition", () => {
    const schedule: ScheduleConfig = {
      mode: "custom",
      daysOfWeek: [1],
      startMinutes: 22 * 60,
      endMinutes: 2 * 60
    };
    const intervals = getScheduleIntervalsBetween(schedule, at(6, 21), at(7, 3));

    expect(intervals).toEqual([
      {
        start: at(6, 22),
        end: at(7, 2)
      }
    ]);
    expect(nextScheduleTransition(schedule, at(6, 21))).toBe(at(6, 22));
    expect(nextScheduleTransition(schedule, at(6, 23))).toBe(at(7, 2));
  });

  it("formats summaries for list rows", () => {
    expect(formatScheduleSummary({ mode: "always" })).toBe("Always active");
    expect(
      formatScheduleSummary({
        mode: "custom",
        daysOfWeek: WEEKDAYS,
        startMinutes: 9 * 60,
        endMinutes: 17 * 60
      })
    ).toBe("Weekdays · 9:00 AM-5:00 PM");
  });
});
