import type { BlockAttempt, UsageSession } from "@/shared/types";
import {
  classificationCategory,
  sortSessionsAscending,
  VISION_CONTINUOUS_GAP_MS
} from "../shared/visionTime";
import { isDistractionCategory } from "../classification/categoryTypes";
import type { DomainClassification, PathwaySummary } from "../types";

export class AttemptChainDetector {
  detect(
    attempts: BlockAttempt[],
    sessions: UsageSession[],
    classifications: Map<string, DomainClassification | null>
  ): PathwaySummary[] {
    const orderedSessions = sortSessionsAscending(sessions);
    const chains = new Map<string, UsageSession[][]>();

    for (const attempt of attempts) {
      const afterAttempt = orderedSessions.filter(
        (session) =>
          session.startedAt >= attempt.attemptedAt &&
          session.startedAt <= attempt.attemptedAt + VISION_CONTINUOUS_GAP_MS
      );
      const distractionSessions = afterAttempt.filter((session) =>
        isDistractionCategory(classificationCategory(classifications, session.domain))
      );

      if (distractionSessions.length === 0) {
        continue;
      }

      const domains = [attempt.domain, ...distractionSessions.map((session) => session.domain)];
      const key = domains.join("->");
      chains.set(key, [...(chains.get(key) ?? []), distractionSessions]);
    }

    return [...chains.entries()]
      .map(([id, groups]) => ({
        id,
        domains: id.split("->"),
        categories: [],
        count: groups.length,
        averageDiversionMs:
          groups.reduce(
            (sum, group) => sum + group.reduce((inner, s) => inner + s.durationMs, 0),
            0
          ) / groups.length,
        commonEntry: id.split("->")[1] ?? null
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }
}
