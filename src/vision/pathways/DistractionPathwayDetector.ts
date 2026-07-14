import type { UsageSession } from "@/shared/types";
import {
  categoryKind,
  classificationCategory,
  sortSessionsAscending,
  VISION_CONTINUOUS_GAP_MS,
  VISION_PATHWAY_WINDOW_MS
} from "../shared/visionTime";
import type { DomainCategory, DomainClassification, PathwaySummary } from "../types";

export class DistractionPathwayDetector {
  detect(
    sessions: UsageSession[],
    classifications: Map<string, DomainClassification | null>
  ): PathwaySummary[] {
    const ordered = sortSessionsAscending(sessions);
    const paths = new Map<string, { sessions: UsageSession[][]; categories: DomainCategory[] }>();

    for (let start = 0; start < ordered.length; start += 1) {
      const startCategory = classificationCategory(classifications, ordered[start].domain);

      if (!startCategory || categoryKind(startCategory) !== "focus") {
        continue;
      }

      const path = [ordered[start]];
      const categories: DomainCategory[] = [startCategory];

      for (let index = start + 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        const gapMs = current.startedAt - previous.endedAt;

        if (
          gapMs > VISION_CONTINUOUS_GAP_MS ||
          current.endedAt - ordered[start].startedAt > VISION_PATHWAY_WINDOW_MS
        ) {
          break;
        }

        const currentCategory = classificationCategory(classifications, current.domain);
        const kind = categoryKind(currentCategory);

        if (kind === "other") {
          break;
        }

        path.push(current);
        categories.push(currentCategory ?? "neutral");

        if (kind === "distraction" && path.length >= 2) {
          const domains = path.map((session) => session.domain);
          const key = domains.join("->");
          const existing = paths.get(key);
          paths.set(key, {
            sessions: [...(existing?.sessions ?? []), [...path]],
            categories: existing?.categories ?? categories
          });
          break;
        }
      }
    }

    return [...paths.entries()]
      .filter(([, value]) => value.sessions.length >= 1)
      .map(([id, value]) => ({
        id,
        domains: id.split("->"),
        categories: value.categories,
        count: value.sessions.length,
        averageDiversionMs:
          value.sessions.reduce(
            (sum, path) => sum + (path[path.length - 1].endedAt - path[0].startedAt),
            0
          ) / value.sessions.length,
        commonEntry: id.split("->").slice(-2, -1)[0] ?? null
      }))
      .sort((a, b) => b.count - a.count || b.averageDiversionMs - a.averageDiversionMs)
      .slice(0, 8);
  }
}
