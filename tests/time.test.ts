import { describe, expect, it } from "vitest";
import {
  formatDurationMinutes,
  formatHistoryDuration,
  splitDurationByLocalDate,
  splitDurationByLocalHour
} from "@/shared/time";

describe("time utilities", () => {
  it("does not produce negative or zero duration slices", () => {
    expect(splitDurationByLocalDate(2000, 1000)).toEqual([]);
    expect(splitDurationByLocalDate(1000, 1000)).toEqual([]);
  });

  it("splits sessions that cross local midnight", () => {
    const startedAt = new Date(2026, 6, 6, 23, 58, 0).getTime();
    const endedAt = new Date(2026, 6, 7, 0, 7, 0).getTime();

    expect(splitDurationByLocalDate(startedAt, endedAt)).toEqual([
      { dateKey: "2026-07-06", durationMs: 2 * 60 * 1000 },
      { dateKey: "2026-07-07", durationMs: 7 * 60 * 1000 }
    ]);
  });

  it("formats whole-minute durations consistently", () => {
    expect(formatDurationMinutes(32)).toBe("32 min");
    expect(formatDurationMinutes(60)).toBe("1 hr");
    expect(formatDurationMinutes(72)).toBe("1 hr 12 min");
    expect(formatDurationMinutes(90)).toBe("1 hr 30 min");
    expect(formatDurationMinutes(150)).toBe("2 hr 30 min");
    expect(formatDurationMinutes(180)).toBe("3 hr");
  });

  it("formats history durations under a minute as seconds", () => {
    expect(formatHistoryDuration(0)).toBe("0 sec");
    expect(formatHistoryDuration(42_000)).toBe("42 sec");
    expect(formatHistoryDuration(60_000)).toBe("1 min");
    expect(formatHistoryDuration(90 * 60_000)).toBe("1 hr 30 min");
  });

  it("splits sessions that cross local hour boundaries", () => {
    const startedAt = new Date(2026, 6, 6, 13, 50, 0).getTime();
    const endedAt = new Date(2026, 6, 6, 14, 20, 0).getTime();

    expect(splitDurationByLocalHour(startedAt, endedAt)).toEqual([
      {
        bucketStart: new Date(2026, 6, 6, 13, 0, 0).getTime(),
        durationMs: 10 * 60 * 1000
      },
      {
        bucketStart: new Date(2026, 6, 6, 14, 0, 0).getTime(),
        durationMs: 20 * 60 * 1000
      }
    ]);
  });
});
