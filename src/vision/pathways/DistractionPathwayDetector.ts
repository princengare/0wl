import type { UsageSession } from "@/shared/types";
import { formatDuration } from "@/shared/time";
import {
  classificationCategory,
  sortSessionsAscending
} from "../shared/visionTime";
import {
  isDistractionCategory,
  isProductiveCategory
} from "../classification/categoryTypes";
import type { DomainCategory, DomainClassification, PathwaySummary } from "../types";

export const VISION_PATHWAY_THRESHOLDS = {
  maxRawChainWindowMs: 60 * 60 * 1000,
  maxDisplayedPathLength: 5,
  minPathwayOccurrences: 3,
  maxGapBetweenSessionsMs: 5 * 60 * 1000,
  collapseSameDomainWithinMs: 10 * 60 * 1000,
  minDistractionDurationMs: 2 * 60 * 1000,
  minFocusBeforeDistractionMs: 5 * 60 * 1000,
  evasionWindowMs: 15 * 60 * 1000,
  substitutionWindowMs: 15 * 60 * 1000
} as const;

interface DomainSegment {
  domain: string;
  category: DomainCategory;
  repeatCount: number;
  totalDurationMs: number;
}

interface PathwayOccurrence {
  categories: DomainCategory[];
  collapsedSegments: DomainSegment[];
  contextSessions: UsageSession[];
  displaySegments: string[];
  diversionMs: number;
  firstDistractionDomain: string;
  includedFocusDomains: string[];
  lastFocusDomain: string | null;
  rawDomains: string[];
  timeBeforeDistractionMs: number;
  totalDurationMs: number;
}

const SEARCH_CONTEXT_DOMAINS = new Set([
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "scholar.google.com",
  "perplexity.ai"
]);

function durationOf(session: UsageSession): number {
  return Math.max(0, session.endedAt - session.startedAt, session.durationMs);
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

function classificationFor(
  classifications: Map<string, DomainClassification | null>,
  domain: string
): DomainClassification | null {
  return classifications.get(domain) ?? null;
}

function categoryFor(
  classifications: Map<string, DomainClassification | null>,
  domain: string
): DomainCategory {
  return classificationCategory(classifications, domain) ?? "neutral";
}

function hasSecondaryProductiveCategory(classification: DomainClassification | null): boolean {
  return Boolean(
    classification?.secondaryCategories.some((category) => isProductiveCategory(category))
  );
}

function hasSecondaryDistractionCategory(classification: DomainClassification | null): boolean {
  return Boolean(
    classification?.secondaryCategories.some((category) => isDistractionCategory(category))
  );
}

export function isFocusContextDomain(
  domain: string,
  classification: DomainClassification | null
): boolean {
  const primary = classification?.primaryCategory ?? null;

  return (
    isProductiveCategory(primary) ||
    hasSecondaryProductiveCategory(classification) ||
    SEARCH_CONTEXT_DOMAINS.has(domain)
  );
}

export function isDistractionContextDomain(
  classification: DomainClassification | null
): boolean {
  return (
    isDistractionCategory(classification?.primaryCategory ?? null) ||
    hasSecondaryDistractionCategory(classification)
  );
}

function boundaryBreaksPath(previous: UsageSession, current: UsageSession): boolean {
  const gapMs = current.startedAt - previous.endedAt;

  return (
    gapMs > VISION_PATHWAY_THRESHOLDS.maxGapBetweenSessionsMs ||
    previous.endReason === "idle" ||
    previous.endReason === "window-blurred" ||
    current.startReason === "idle-resumed" ||
    current.startReason === "window-focused"
  );
}

function collapseSameDomainRuns(
  sessions: UsageSession[],
  classifications: Map<string, DomainClassification | null>
): DomainSegment[] {
  const segments: DomainSegment[] = [];

  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    const previous = segments[segments.length - 1];
    const durationMs = durationOf(session);

    if (
      previous &&
      previous.domain === session.domain &&
      session.startedAt - sessions[index - 1].endedAt <=
        VISION_PATHWAY_THRESHOLDS.collapseSameDomainWithinMs
    ) {
      previous.repeatCount += 1;
      previous.totalDurationMs += durationMs;
      continue;
    }

    segments.push({
      domain: session.domain,
      category: categoryFor(classifications, session.domain),
      repeatCount: 1,
      totalDurationMs: durationMs
    });
  }

  return segments;
}

function collapsedSegmentLabel(segments: DomainSegment[]): string {
  return segments
    .map((segment) => {
      const repeat = segment.repeatCount > 1 ? ` x${segment.repeatCount}` : "";
      return `${segment.domain}${repeat} (${formatDuration(segment.totalDurationMs)})`;
    })
    .join(" -> ");
}

function contextLabel(contextSessions: UsageSession[]): string {
  const domains = uniqueInOrder(contextSessions.map((session) => session.domain));

  if (domains.length > 1) {
    return "Research/dev loop";
  }

  const domain = contextSessions[0]?.domain ?? "Focus session";

  if (domain.includes("github") || domain.includes("wxt") || domain.includes("dev")) {
    return "Coding session";
  }

  return "Focus session";
}

function displaySegmentsFor(
  contextSessions: UsageSession[],
  distractionDomain: string,
  rawSegments: DomainSegment[]
): string[] {
  if (rawSegments.length > VISION_PATHWAY_THRESHOLDS.maxDisplayedPathLength) {
    return [contextLabel(contextSessions), "...", distractionDomain];
  }

  return [contextLabel(contextSessions), distractionDomain];
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function strengthFor(count: number): "low" | "medium" | "high" {
  if (count >= 5) {
    return "high";
  }

  if (count >= VISION_PATHWAY_THRESHOLDS.minPathwayOccurrences) {
    return "medium";
  }

  return "low";
}

function buildOccurrence(
  chain: UsageSession[],
  contextSessions: UsageSession[],
  distractionSession: UsageSession,
  classifications: Map<string, DomainClassification | null>
): PathwayOccurrence | null {
  const focusDurationMs = contextSessions.reduce(
    (sum, session) => sum + durationOf(session),
    0
  );
  const distractionDurationMs = durationOf(distractionSession);

  if (
    focusDurationMs < VISION_PATHWAY_THRESHOLDS.minFocusBeforeDistractionMs ||
    distractionDurationMs < VISION_PATHWAY_THRESHOLDS.minDistractionDurationMs
  ) {
    return null;
  }

  const rawSegments = collapseSameDomainRuns(chain, classifications);
  const rawDomains = chain.map((session) => session.domain);
  const includedFocusDomains = uniqueInOrder(contextSessions.map((session) => session.domain));
  const lastFocusDomain = contextSessions[contextSessions.length - 1]?.domain ?? null;
  const displaySegments = displaySegmentsFor(
    contextSessions,
    distractionSession.domain,
    rawSegments
  );
  const startedAt = contextSessions[0]?.startedAt ?? distractionSession.startedAt;

  return {
    categories: rawSegments.map((segment) => segment.category),
    collapsedSegments: rawSegments,
    contextSessions,
    displaySegments,
    diversionMs: distractionDurationMs,
    firstDistractionDomain: distractionSession.domain,
    includedFocusDomains,
    lastFocusDomain,
    rawDomains,
    timeBeforeDistractionMs: Math.max(0, distractionSession.startedAt - startedAt),
    totalDurationMs: Math.max(0, distractionSession.endedAt - startedAt)
  };
}

function summaryFromOccurrences(key: string, occurrences: PathwayOccurrence[]): PathwaySummary {
  const first = occurrences[0];
  const displaySegments = first.displaySegments;
  const displayLabel = displaySegments.join(" -> ");
  const firstDistractionDomain = first.firstDistractionDomain;
  const lastFocusDomain = first.lastFocusDomain;
  const count = occurrences.length;
  const includedFocusDomains = uniqueInOrder(
    occurrences.flatMap((occurrence) => occurrence.includedFocusDomains)
  );
  const rawDomains = first.rawDomains;
  const includedDomains = uniqueInOrder(occurrences.flatMap((occurrence) => occurrence.rawDomains));

  return {
    id: key,
    domains: displaySegments.filter((segment) => segment !== "..."),
    categories: first.categories,
    count,
    averageDiversionMs: average(occurrences.map((occurrence) => occurrence.diversionMs)),
    commonEntry: lastFocusDomain,
    displayLabel,
    displaySegments,
    rawDomains,
    includedFocusDomains,
    lastFocusDomain,
    firstDistractionDomain,
    averageTimeBeforeDistractionMs: average(
      occurrences.map((occurrence) => occurrence.timeBeforeDistractionMs)
    ),
    totalDurationMs: occurrences.reduce(
      (sum, occurrence) => sum + occurrence.totalDurationMs,
      0
    ),
    confidence: strengthFor(count),
    details: [
      { label: "repeat count", value: `${count}x` },
      { label: "last focus site", value: lastFocusDomain ?? "unknown" },
      { label: "first distraction", value: firstDistractionDomain },
      { label: "included focus sites", value: includedFocusDomains.join(", ") || "none" },
      { label: "collapsed segments", value: collapsedSegmentLabel(first.collapsedSegments) },
      { label: "raw domains", value: rawDomains.join(" -> ") },
      { label: "included domains", value: includedDomains.join(", ") },
      { label: "strength", value: strengthFor(count) }
    ]
  };
}

export class DistractionPathwayDetector {
  detect(
    sessions: UsageSession[],
    classifications: Map<string, DomainClassification | null>
  ): PathwaySummary[] {
    const ordered = sortSessionsAscending(sessions);
    const paths = new Map<string, PathwayOccurrence[]>();

    for (let start = 0; start < ordered.length; start += 1) {
      const startSession = ordered[start];

      if (
        !isFocusContextDomain(
          startSession.domain,
          classificationFor(classifications, startSession.domain)
        )
      ) {
        continue;
      }

      const chain: UsageSession[] = [startSession];
      const contextSessions: UsageSession[] = [startSession];
      let foundDistractionIndex: number | null = null;

      for (let index = start + 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];

        if (
          boundaryBreaksPath(previous, current) ||
          current.endedAt - startSession.startedAt >
            VISION_PATHWAY_THRESHOLDS.maxRawChainWindowMs
        ) {
          break;
        }

        const currentClassification = classificationFor(classifications, current.domain);

        if (isDistractionContextDomain(currentClassification)) {
          chain.push(current);
          const occurrence = buildOccurrence(
            chain,
            contextSessions,
            current,
            classifications
          );

          if (occurrence) {
            const key = `${occurrence.displaySegments.join("->")}`;
            paths.set(key, [...(paths.get(key) ?? []), occurrence]);
          }

          foundDistractionIndex = index;
          break;
        }

        if (!isFocusContextDomain(current.domain, currentClassification)) {
          break;
        }

        chain.push(current);
        contextSessions.push(current);
      }

      if (foundDistractionIndex !== null) {
        start = foundDistractionIndex;
      }
    }

    return [...paths.entries()]
      .filter(([, occurrences]) => occurrences.length >= VISION_PATHWAY_THRESHOLDS.minPathwayOccurrences)
      .map(([id, occurrences]) => summaryFromOccurrences(id, occurrences))
      .sort((a, b) => b.count - a.count || b.averageDiversionMs - a.averageDiversionMs)
      .slice(0, 8);
  }
}
