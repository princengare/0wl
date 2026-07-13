import { describe, expect, it } from "vitest";
import { getHistoryPanelMode } from "@/shared/historySelection";

describe("history bar selection panel behavior", () => {
  it("keeps today's timestamp list when no bar is selected", () => {
    expect(getHistoryPanelMode("today", false)).toBe("today-sessions");
  });

  it("shows selected-hour aggregates for today and yesterday", () => {
    expect(getHistoryPanelMode("today", true)).toBe("hour-summary");
    expect(getHistoryPanelMode("yesterday", true)).toBe("hour-summary");
  });

  it("does not show yesterday's old timestamp list without a selected bar", () => {
    expect(getHistoryPanelMode("yesterday", false)).toBe("hour-placeholder");
  });

  it("shows last-seven-day summaries only after day selection", () => {
    expect(getHistoryPanelMode("last-7-days", false)).toBe("day-placeholder");
    expect(getHistoryPanelMode("last-7-days", true)).toBe("day-summary");
  });
});
