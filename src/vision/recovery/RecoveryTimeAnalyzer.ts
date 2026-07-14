import type { UsageSession } from "@/shared/types";
import {
  classificationCategory,
  sortSessionsAscending,
  VISION_RECOVERY_WINDOW_MS
} from "../shared/visionTime";
import { isDistractionCategory, isProductiveCategory } from "../classification/categoryTypes";
import type { DomainClassification, RecoverySummary } from "../types";

export class RecoveryTimeAnalyzer {
  analyze(
    sessions: UsageSession[],
    classifications: Map<string, DomainClassification | null>,
    now = Date.now()
  ): RecoverySummary {
    const ordered = sortSessionsAscending(sessions);
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;
    const recoveries: Array<{ domain: string; durationMs: number; startedAt: number }> = [];

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousCategory = classificationCategory(classifications, previous.domain);
      const currentCategory = classificationCategory(classifications, current.domain);

      if (!isProductiveCategory(previousCategory) || !isDistractionCategory(currentCategory)) {
        continue;
      }

      for (let cursor = index + 1; cursor < ordered.length; cursor += 1) {
        const candidate = ordered[cursor];

        if (candidate.startedAt - current.startedAt > VISION_RECOVERY_WINDOW_MS) {
          break;
        }

        if (isProductiveCategory(classificationCategory(classifications, candidate.domain))) {
          recoveries.push({
            domain: current.domain,
            durationMs: candidate.startedAt - current.startedAt,
            startedAt: current.startedAt
          });
          break;
        }
      }
    }

    const total = recoveries.reduce((sum, recovery) => sum + recovery.durationMs, 0);
    const byDomain = new Map<string, { count: number; totalRecoveryMs: number }>();

    for (const recovery of recoveries) {
      const row = byDomain.get(recovery.domain) ?? { count: 0, totalRecoveryMs: 0 };
      byDomain.set(recovery.domain, {
        count: row.count + 1,
        totalRecoveryMs: row.totalRecoveryMs + recovery.durationMs
      });
    }

    return {
      averageRecoveryMs: recoveries.length > 0 ? total / recoveries.length : 0,
      weeklyRecoveryMs: recoveries
        .filter((recovery) => recovery.startedAt >= weekStart)
        .reduce((sum, recovery) => sum + recovery.durationMs, 0),
      worstDomains: [...byDomain.entries()]
        .map(([domain, row]) => ({
          domain,
          count: row.count,
          totalRecoveryMs: row.totalRecoveryMs,
          averageRecoveryMs: row.totalRecoveryMs / row.count
        }))
        .sort((a, b) => b.totalRecoveryMs - a.totalRecoveryMs)
        .slice(0, 5)
    };
  }
}
