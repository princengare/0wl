import { ALWAYS_SCHEDULE, formatTimeOfDay } from "@/shared/schedule";
import { formatDuration } from "@/shared/time";
import type { DayOfWeek, ScheduleConfig } from "@/shared/types";
import type {
  HeatmapCell,
  PathwaySummary,
  SubstitutionSummary,
  VisionRecommendation,
  VisionSettings
} from "../types";

function scheduleForHeatmapCell(cell: HeatmapCell): ScheduleConfig {
  return {
    mode: "custom",
    daysOfWeek: [cell.dayOfWeek as DayOfWeek],
    startMinutes: cell.hour * 60,
    endMinutes: cell.hour === 23 ? 0 : (cell.hour + 1) * 60
  };
}

function heatmapTimeRangeLabel(cell: HeatmapCell): string {
  const startMinutes = cell.hour * 60;
  const endMinutes = cell.hour === 23 ? 0 : (cell.hour + 1) * 60;

  return `${formatTimeOfDay(startMinutes)}-${formatTimeOfDay(endMinutes)}`;
}

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

    const topHeatmapDomain = topHeatmap?.domains[0] ?? null;

    if (topHeatmap && topHeatmapDomain && topHeatmap.count >= 2) {
      recommendations.push({
        id: `heatmap:${topHeatmap.dayOfWeek}:${topHeatmap.hour}:${topHeatmapDomain.domain}`,
        title: "Schedule a block around repeated attempts",
        reason: `${topHeatmapDomain.domain} attempts cluster around ${heatmapTimeRangeLabel(topHeatmap)}.`,
        supportingMetric: `${topHeatmapDomain.count} attempts in this hour bucket`,
        proposedAction: `Create or update a scheduled block for ${topHeatmapDomain.domain}.`,
        strength: topHeatmap.count >= 5 ? "high" : "medium",
        domains: [topHeatmapDomain.domain],
        action: {
          type: "add_block",
          domain: topHeatmapDomain.domain,
          schedule: scheduleForHeatmapCell(topHeatmap)
        }
      });
    }

    const pathway = input.pathways[0];

    if (pathway?.firstDistractionDomain) {
      const domain = pathway.firstDistractionDomain;
      recommendations.push({
        id: `friction:${domain}`,
        title: "Add friction before a recurring distraction path",
        reason: `${domain} appears as the first distraction in a recurring path.`,
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
