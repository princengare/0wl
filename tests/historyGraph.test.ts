import { describe, expect, it } from "vitest";
import {
  averageDailyUsageMs,
  createCalendarWeekUsageBuckets,
  createHourlyUsageBuckets
} from "@/shared/historyGraph";

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 6, day, hour, minute, 0).getTime();
}

describe("history graph aggregation", () => {
  it("buckets a session fully within one hour", () => {
    const buckets = createHourlyUsageBuckets(
      [{ domain: "github.com", startedAt: at(6, 9, 10), endedAt: at(6, 9, 40) }],
      at(6, 12)
    );

    expect(buckets[9]?.totalMs).toBe(30 * 60 * 1000);
    expect(buckets[9]?.domains).toEqual([{ domain: "github.com", durationMs: 30 * 60 * 1000 }]);
  });

  it("splits a session crossing an hour boundary", () => {
    const buckets = createHourlyUsageBuckets(
      [{ domain: "youtube.com", startedAt: at(6, 13, 50), endedAt: at(6, 14, 20) }],
      at(6, 12)
    );

    expect(buckets[13]?.totalMs).toBe(10 * 60 * 1000);
    expect(buckets[14]?.totalMs).toBe(20 * 60 * 1000);
  });

  it("splits a session crossing multiple hours and ranks domains", () => {
    const buckets = createHourlyUsageBuckets(
      [
        { domain: "youtube.com", startedAt: at(6, 10, 30), endedAt: at(6, 12, 30) },
        { domain: "github.com", startedAt: at(6, 11, 0), endedAt: at(6, 11, 45) }
      ],
      at(6, 12)
    );

    expect(buckets[10]?.totalMs).toBe(30 * 60 * 1000);
    expect(buckets[11]?.totalMs).toBe(105 * 60 * 1000);
    expect(buckets[11]?.domains[0]).toEqual({
      domain: "youtube.com",
      durationMs: 60 * 60 * 1000
    });
    expect(buckets[12]?.totalMs).toBe(30 * 60 * 1000);
  });

  it("splits sessions crossing midnight into the correct local days", () => {
    const todayBuckets = createHourlyUsageBuckets(
      [{ domain: "reddit.com", startedAt: at(6, 23, 50), endedAt: at(7, 0, 20) }],
      at(6, 12)
    );
    const tomorrowBuckets = createHourlyUsageBuckets(
      [{ domain: "reddit.com", startedAt: at(6, 23, 50), endedAt: at(7, 0, 20) }],
      at(7, 12)
    );

    expect(todayBuckets[23]?.totalMs).toBe(10 * 60 * 1000);
    expect(tomorrowBuckets[0]?.totalMs).toBe(20 * 60 * 1000);
  });

  it("creates calendar-week day totals and includes no-usage days as zero", () => {
    const buckets = createCalendarWeekUsageBuckets(
      [
        { domain: "github.com", startedAt: at(5, 10), endedAt: at(5, 11) },
        { domain: "youtube.com", startedAt: at(7, 10), endedAt: at(7, 12) },
        { domain: "reddit.com", startedAt: at(4, 10), endedAt: at(4, 11) }
      ],
      at(8, 12)
    );

    expect(buckets).toHaveLength(7);
    expect(buckets[0]?.totalMs).toBe(60 * 60 * 1000);
    expect(buckets[2]?.totalMs).toBe(2 * 60 * 60 * 1000);
    expect(buckets[6]?.totalMs).toBe(0);
    expect(averageDailyUsageMs(buckets)).toBe((3 * 60 * 60 * 1000) / 2);
  });

  it("returns zero average when the week has no usage", () => {
    const buckets = createCalendarWeekUsageBuckets([], at(8, 12));

    expect(averageDailyUsageMs(buckets)).toBe(0);
  });
});
