import type { DomainTransition, TransitionSummary } from "../types";
import { isDistractionCategory, isProductiveCategory } from "../classification/categoryTypes";

function summarize(transitions: DomainTransition[]): TransitionSummary[] {
  const rows = new Map<string, DomainTransition[]>();

  for (const transition of transitions) {
    const key = `${transition.fromDomain}->${transition.toDomain}`;
    rows.set(key, [...(rows.get(key) ?? []), transition]);
  }

  return [...rows.entries()]
    .map(([id, group]) => ({
      id,
      fromDomain: group[0].fromDomain,
      toDomain: group[0].toDomain,
      fromCategory: group[0].fromCategory,
      toCategory: group[0].toCategory,
      count: group.length,
      averageGapMs: group.reduce((sum, transition) => sum + transition.gapMs, 0) / group.length,
      averagePreviousSessionDurationMs:
        group.reduce((sum, transition) => sum + transition.previousSessionDurationMs, 0) /
        group.length
    }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function mostCommonTransitions(transitions: DomainTransition[]): TransitionSummary[] {
  return summarize(transitions).slice(0, 10);
}

export function transitionsIntoDistraction(transitions: DomainTransition[]): TransitionSummary[] {
  return summarize(
    transitions.filter((transition) => isDistractionCategory(transition.toCategory))
  ).slice(0, 10);
}

export function transitionsOutOfFocus(transitions: DomainTransition[]): TransitionSummary[] {
  return summarize(
    transitions.filter((transition) => isProductiveCategory(transition.fromCategory))
  ).slice(0, 10);
}
