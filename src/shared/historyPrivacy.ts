import { normalizeWindowScope } from "@/platform/windowScope";
import type { HistorySessionView, UsageMode, UsageSession, WindowScope } from "./types";

export function privateAggregateHistoryLabel(mode: UsageMode): string {
  if (mode === "pip") {
    return "Private Picture-in-Picture";
  }

  if (mode === "background") {
    return "Private background media";
  }

  return "Private browsing";
}

export function toHistorySessionView(
  session: UsageSession,
  windowScope: WindowScope,
  usageMode: UsageMode
): HistorySessionView {
  const normalizedScope = normalizeWindowScope(windowScope);

  return {
    id: session.id,
    domain:
      normalizedScope === "private"
        ? privateAggregateHistoryLabel(usageMode)
        : session.domain,
    windowScope: normalizedScope,
    usageMode,
    aggregateOnly: normalizedScope === "private",
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: session.durationMs,
    dateKey: session.dateKey
  };
}
