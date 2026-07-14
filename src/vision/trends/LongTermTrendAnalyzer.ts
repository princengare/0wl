import type { BlockAttempt, UsageSession } from "@/shared/types";
import { isDistractionCategory } from "../classification/categoryTypes";
import { classificationCategory, monthStart, weekStart } from "../shared/visionTime";
import type { DomainClassification, TrendSummary } from "../types";

export class LongTermTrendAnalyzer {
  analyze(
    sessions: UsageSession[],
    attempts: BlockAttempt[],
    classifications: Map<string, DomainClassification | null>,
    focusInterruptionCount: number,
    now = Date.now()
  ): TrendSummary {
    const dayStart = new Date(
      new Date(now).getFullYear(),
      new Date(now).getMonth(),
      new Date(now).getDate()
    ).getTime();
    const currentWeekStart = weekStart(now);
    const currentMonthStart = monthStart(now);
    const distractionSessions = sessions.filter((session) =>
      isDistractionCategory(classificationCategory(classifications, session.domain))
    );
    const sumSince = (start: number) =>
      distractionSessions
        .filter((session) => session.endedAt >= start)
        .reduce((sum, session) => sum + session.durationMs, 0);

    return {
      dailyDistractionMs: sumSince(dayStart),
      weeklyDistractionMs: sumSince(currentWeekStart),
      monthlyDistractionMs: sumSince(currentMonthStart),
      blockedAttemptCount: attempts.reduce((sum, attempt) => sum + attempt.count, 0),
      focusInterruptionCount
    };
  }
}
