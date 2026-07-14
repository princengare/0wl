import type { DomainTransition, ContextSummary } from "../types";
import { isDistractionCategory } from "../classification/categoryTypes";
import { compactCountMap, hourOf } from "../shared/visionTime";

export class PreDistractionContextAnalyzer {
  analyze(transitions: DomainTransition[]): ContextSummary[] {
    const byDomain = new Map<string, DomainTransition[]>();

    for (const transition of transitions) {
      if (!isDistractionCategory(transition.toCategory)) {
        continue;
      }

      byDomain.set(transition.toDomain, [...(byDomain.get(transition.toDomain) ?? []), transition]);
    }

    return [...byDomain.entries()]
      .map(([domain, rows]) => {
        const categoryCounts = compactCountMap(
          rows.map((transition) => transition.fromCategory ?? "other")
        );
        const total = rows.length || 1;

        return {
          domain,
          previousCategories: categoryCounts.map(({ value, count }) => ({
            category: value,
            count,
            percent: Math.round((count / total) * 100)
          })),
          previousDomains: compactCountMap(rows.map((transition) => transition.fromDomain)).map(
            ({ value, count }) => ({ domain: value, count })
          ),
          commonHours: compactCountMap(
            rows.map((transition) => String(hourOf(transition.transitionedAt)))
          ).map(({ value, count }) => ({ hour: Number(value), count })),
          averagePreviousSessionDurationMs:
            rows.reduce((sum, transition) => sum + transition.previousSessionDurationMs, 0) / total
        };
      })
      .sort((a, b) => b.previousDomains.length - a.previousDomains.length)
      .slice(0, 5);
  }
}
