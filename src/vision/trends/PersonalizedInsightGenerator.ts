import { formatDuration } from "@/shared/time";
import type {
  BlockOutcomeSummary,
  ContextSummary,
  PathwaySummary,
  PersonalizedInsight,
  RecoverySummary,
  SubstitutionSummary,
  TrendSummary
} from "../types";

export class PersonalizedInsightGenerator {
  generate(input: {
    contexts: ContextSummary[];
    pathways: PathwaySummary[];
    recovery: RecoverySummary;
    outcomes: BlockOutcomeSummary[];
    substitutions: SubstitutionSummary[];
    trends: TrendSummary;
  }): PersonalizedInsight[] {
    const insights: PersonalizedInsight[] = [];
    const context = input.contexts[0];

    if (context && context.previousCategories.length > 0) {
      const top = context.previousCategories[0];
      insights.push({
        id: `context:${context.domain}`,
        text: `You most often open ${context.domain} after ${top.category} websites.`,
        supportingMetric: `${top.percent}% of recent transitions into ${context.domain}`,
        period: "recent history",
        domains: [context.domain],
        suggestedAction: "Consider a scheduled pause before this transition."
      });
    }

    const pathway = input.pathways[0];

    if (pathway && pathway.count >= 1) {
      insights.push({
        id: `pathway:${pathway.id}`,
        text: `${pathway.domains[pathway.domains.length - 1]} is involved in a recurring distraction pathway.`,
        supportingMetric: `Occurred ${pathway.count} time${pathway.count === 1 ? "" : "s"}`,
        period: "recent history",
        domains: pathway.domains,
        suggestedAction: "Review the pathway and consider grouped friction."
      });
    }

    if (input.recovery.averageRecoveryMs > 0) {
      insights.push({
        id: "recovery:average",
        text: `Your average estimated recovery time is ${formatDuration(input.recovery.averageRecoveryMs)}.`,
        supportingMetric: `${formatDuration(input.recovery.weeklyRecoveryMs)} this week`,
        period: "this week",
        domains: input.recovery.worstDomains.map((row) => row.domain),
        suggestedAction: "Use this as an estimate, not a clinical metric."
      });
    }

    const outcome = input.outcomes.find((row) => row.attempts >= 2);

    if (outcome) {
      insights.push({
        id: `outcome:${outcome.domain}`,
        text: `Blocked ${outcome.domain} attempts return to focus ${outcome.returnedToFocusPercent}% of the time.`,
        supportingMetric: `${outcome.attempts} blocked attempts`,
        period: "recent history",
        domains: [outcome.domain],
        suggestedAction: "Keep this block if the bounce-back rate feels useful."
      });
    }

    const substitution = input.substitutions[0];

    if (substitution?.substitutes.length) {
      insights.push({
        id: `substitution:${substitution.blockedDomain}`,
        text: `${substitution.substitutes[0].domain} is a possible substitute after blocking ${substitution.blockedDomain}.`,
        supportingMetric: `Usage increased by ${formatDuration(substitution.substitutes[0].increasedMsPerDay)} per day`,
        period: "7-day before/after estimate",
        domains: [substitution.blockedDomain, substitution.substitutes[0].domain],
        suggestedAction: "Consider grouping substitute distractions together."
      });
    }

    if (input.trends.weeklyDistractionMs > 0) {
      insights.push({
        id: "trend:weekly-distraction",
        text: `Tracked distraction-category time this week is ${formatDuration(input.trends.weeklyDistractionMs)}.`,
        supportingMetric: `${input.trends.focusInterruptionCount} focus interruptions detected`,
        period: "this week",
        domains: [],
        suggestedAction: null
      });
    }

    return insights.slice(0, 8);
  }
}
