import type { BlockAttempt, UsageSession } from "@/shared/types";
import { isDistractionCategory, isProductiveCategory } from "../classification/categoryTypes";
import {
  classificationCategory,
  sortSessionsAscending,
  VISION_CONTINUOUS_GAP_MS
} from "../shared/visionTime";
import type { BlockOutcomeSummary, DomainClassification } from "../types";

export class BlockOutcomeAnalyzer {
  analyze(
    attempts: BlockAttempt[],
    sessions: UsageSession[],
    classifications: Map<string, DomainClassification | null>
  ): BlockOutcomeSummary[] {
    const ordered = sortSessionsAscending(sessions);
    const byDomain = new Map<
      string,
      { attempts: number; focus: number; distraction: number; inactive: number }
    >();

    for (const attempt of attempts) {
      const nextSession = ordered.find(
        (session) =>
          session.startedAt >= attempt.attemptedAt &&
          session.startedAt <= attempt.attemptedAt + VISION_CONTINUOUS_GAP_MS
      );
      const row = byDomain.get(attempt.domain) ?? {
        attempts: 0,
        focus: 0,
        distraction: 0,
        inactive: 0
      };
      row.attempts += attempt.count;

      if (!nextSession) {
        row.inactive += attempt.count;
      } else {
        const category = classificationCategory(classifications, nextSession.domain);

        if (isProductiveCategory(category)) {
          row.focus += attempt.count;
        } else if (isDistractionCategory(category)) {
          row.distraction += attempt.count;
        } else {
          row.inactive += attempt.count;
        }
      }

      byDomain.set(attempt.domain, row);
    }

    return [...byDomain.entries()]
      .map(([domain, row]) => ({
        domain,
        attempts: row.attempts,
        returnedToFocusPercent: Math.round((row.focus / row.attempts) * 100),
        substituteDistractionPercent: Math.round((row.distraction / row.attempts) * 100),
        inactivePercent: Math.round((row.inactive / row.attempts) * 100)
      }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 8);
  }
}
