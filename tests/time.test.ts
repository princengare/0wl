import { describe, expect, it } from "vitest";
import { splitDurationByLocalDate } from "@/shared/time";

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
});
