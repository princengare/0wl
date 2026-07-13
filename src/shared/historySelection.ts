import type { HistoryRange } from "./types";

export type HistoryPanelMode =
  "today-sessions" | "hour-summary" | "hour-placeholder" | "day-summary" | "day-placeholder";

export function getHistoryPanelMode(
  range: HistoryRange,
  hasSelectedBucket: boolean
): HistoryPanelMode {
  if (range === "last-7-days") {
    return hasSelectedBucket ? "day-summary" : "day-placeholder";
  }

  if (hasSelectedBucket) {
    return "hour-summary";
  }

  return range === "today" ? "today-sessions" : "hour-placeholder";
}
