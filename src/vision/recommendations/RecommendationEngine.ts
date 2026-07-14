import { ALWAYS_SCHEDULE } from "@/shared/schedule";
import { formatDuration } from "@/shared/time";
import type {
  HeatmapCell,
  PathwaySummary,
  SubstitutionSummary,
  VisionRecommendation,
  VisionSettings
} from "../types";

export class RecommendationEngine {
  generate(input: {
    heatmap: HeatmapCell[];
    pathways: PathwaySummary[];
    substitutions: SubstitutionSummary[];
    settings: VisionSettings;
  }): VisionRecommendation[] {
    if (!input.settings.adaptiveRecommendationsEnabled) {
      return [];
    }

    const recommendations: VisionRecommendation[] = [];
    const topHeatmap = [...input.heatmap].sort((a, b) => b.count - a.count)[0];

    if (topHeatmap && topHeatmap.count >= 2) {
      recommendations.push({
        id: `heatmap:${topHeatmap.dayOfWeek}:${topHeatmap.hour}`,
        title: "Schedule a block around repeated attempts",
        reason: `Blocked attempts cluster around ${topHeatmap.hour}:00.`,
        supportingMetric: `${topHeatmap.count} attempts in this hour bucket`,
        proposedAction: "Create a scheduled block for the repeated domain.",
        strength: topHeatmap.count >= 5 ? "high" : "medium",
        domains: [],
        action: { type: "none" }
      });
    }

    const pathway = input.pathways[0];

    if (pathway) {
      const domain = pathway.domains[pathway.domains.length - 1];
      recommendations.push({
        id: `friction:${domain}`,
        title: "Add friction before a recurring distraction path",
        reason: `${domain} appears at the end of a detected path.`,
        supportingMetric: `Average diversion ${formatDuration(pathway.averageDiversionMs)}`,
        proposedAction: `Add pause friction to ${domain}.`,
        strength: pathway.count >= 3 ? "high" : "medium",
        domains: [domain],
        action: { type: "add_friction", domain, level: 1, schedule: ALWAYS_SCHEDULE }
      });
    }

    const substitution = input.substitutions.find((row) => row.substitutes.length > 0);

    if (substitution) {
      const substitute = substitution.substitutes[0].domain;
      recommendations.push({
        id: `group:${substitution.blockedDomain}:${substitute}`,
        title: "Group a possible substitute distraction",
        reason: `${substitute} increased after ${substitution.blockedDomain} was blocked.`,
        supportingMetric: `${formatDuration(substitution.substitutes[0].increasedMsPerDay)} more per day`,
        proposedAction: `Consider blocking or adding friction to ${substitute}.`,
        strength: "medium",
        domains: [substitution.blockedDomain, substitute],
        action: { type: "add_friction", domain: substitute, level: 1, schedule: ALWAYS_SCHEDULE }
      });
    }

    return recommendations.filter(
      (recommendation) => !input.settings.dismissedRecommendationIds.includes(recommendation.id)
    );
  }
}
