import type { UsageSession } from "@/shared/types";
import type { BlockedDomain } from "@/shared/types";
import { isDistractionCategory } from "../classification/categoryTypes";
import { classificationCategory } from "../shared/visionTime";
import type { DomainClassification, SubstitutionSummary } from "../types";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function usageByDomain(sessions: UsageSession[]): Map<string, number> {
  const usage = new Map<string, number>();

  for (const session of sessions) {
    usage.set(session.domain, (usage.get(session.domain) ?? 0) + session.durationMs);
  }

  return usage;
}

export class SubstitutionDetector {
  detect(
    blockedDomains: BlockedDomain[],
    sessions: UsageSession[],
    classifications: Map<string, DomainClassification | null>
  ): SubstitutionSummary[] {
    return blockedDomains
      .flatMap((blocked) => {
        const before = sessions.filter(
          (session) =>
            session.startedAt >= blocked.createdAt - WINDOW_MS &&
            session.endedAt < blocked.createdAt
        );
        const after = sessions.filter(
          (session) =>
            session.startedAt >= blocked.createdAt &&
            session.startedAt < blocked.createdAt + WINDOW_MS
        );

        if (before.length === 0 || after.length === 0) {
          return [];
        }

        const beforeUsage = usageByDomain(before);
        const afterUsage = usageByDomain(after);
        const beforeBlocked = beforeUsage.get(blocked.domain) ?? 0;
        const afterBlocked = afterUsage.get(blocked.domain) ?? 0;
        const decreasedMsPerDay = Math.max(0, (beforeBlocked - afterBlocked) / 7);

        if (decreasedMsPerDay <= 0) {
          return [];
        }

        const substitutes = [...afterUsage.entries()]
          .filter(
            ([domain]) =>
              domain !== blocked.domain &&
              isDistractionCategory(classificationCategory(classifications, domain))
          )
          .map(([domain, afterMs]) => ({
            domain,
            increasedMsPerDay: Math.max(0, (afterMs - (beforeUsage.get(domain) ?? 0)) / 7)
          }))
          .filter((row) => row.increasedMsPerDay > 0)
          .sort((a, b) => b.increasedMsPerDay - a.increasedMsPerDay)
          .slice(0, 5);

        return [
          {
            blockedDomain: blocked.domain,
            decreasedMsPerDay,
            substitutes,
            netReclaimedMsPerDay:
              decreasedMsPerDay -
              substitutes.reduce((sum, substitute) => sum + substitute.increasedMsPerDay, 0)
          }
        ];
      })
      .sort((a, b) => b.decreasedMsPerDay - a.decreasedMsPerDay);
  }
}
