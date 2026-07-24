import type { BlockAttempt, UsageSession } from "@/shared/types";
import {
  VISION_PATHWAY_THRESHOLDS,
  isDistractionContextDomain
} from "../pathways/DistractionPathwayDetector";
import { classificationCategory, sortSessionsAscending } from "../shared/visionTime";
import type { DomainClassification, PathwaySummary } from "../types";

interface EvasionOccurrence {
  attemptedDomain: string;
  substituteDomain: string;
  rawDomains: string[];
  diversionMs: number;
}

function durationOf(session: UsageSession): number {
  return Math.max(0, session.endedAt - session.startedAt, session.durationMs);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

export class BlockEvasionDetector {
  detect(
    attempts: BlockAttempt[],
    sessions: UsageSession[],
    classifications: Map<string, DomainClassification | null>
  ): PathwaySummary[] {
    const orderedSessions = sortSessionsAscending(sessions);
    const groups = new Map<string, EvasionOccurrence[]>();

    for (const attempt of attempts) {
      const windowEnd = attempt.attemptedAt + VISION_PATHWAY_THRESHOLDS.evasionWindowMs;
      const afterAttempt = orderedSessions.filter(
        (session) => session.startedAt >= attempt.attemptedAt && session.startedAt <= windowEnd
      );
      const substituteSessions = afterAttempt.filter(
        (session) =>
          session.domain !== attempt.domain &&
          isDistractionContextDomain(classifications.get(session.domain) ?? null)
      );
      const firstSubstitute = substituteSessions[0];

      if (!firstSubstitute) {
        continue;
      }

      const key = `${attempt.domain}->${firstSubstitute.domain}`;
      const occurrence: EvasionOccurrence = {
        attemptedDomain: attempt.domain,
        substituteDomain: firstSubstitute.domain,
        rawDomains: [attempt.domain, ...substituteSessions.map((session) => session.domain)],
        diversionMs: substituteSessions.reduce((sum, session) => sum + durationOf(session), 0)
      };

      groups.set(key, [...(groups.get(key) ?? []), occurrence]);
    }

    return [...groups.entries()]
      .map(([id, occurrences]) => {
        const first = occurrences[0];
        const rawDomains = uniqueInOrder(
          occurrences.flatMap((occurrence) => occurrence.rawDomains)
        );
        const categories = rawDomains.map(
          (domain) => classificationCategory(classifications, domain) ?? "neutral"
        );
        const count = occurrences.length;

        return {
          id: `evasion:${id}`,
          domains: [first.attemptedDomain, first.substituteDomain],
          categories,
          count,
          averageDiversionMs: average(occurrences.map((occurrence) => occurrence.diversionMs)),
          commonEntry: first.attemptedDomain,
          displayLabel: `${first.attemptedDomain} blocked -> ${first.substituteDomain}`,
          displaySegments: [`${first.attemptedDomain} blocked`, first.substituteDomain],
          rawDomains,
          includedFocusDomains: [],
          lastFocusDomain: null,
          firstDistractionDomain: first.substituteDomain,
          confidence: count >= 3 ? "high" : "medium",
          details: [
            { label: "repeat count", value: `${count}x` },
            { label: "blocked site", value: first.attemptedDomain },
            { label: "possible fallback", value: first.substituteDomain },
            { label: "raw domains", value: rawDomains.join(" -> ") },
            { label: "wording", value: "possible fallback after block" }
          ]
        } satisfies PathwaySummary;
      })
      .sort((a, b) => b.count - a.count || b.averageDiversionMs - a.averageDiversionMs)
      .slice(0, 5);
  }
}
