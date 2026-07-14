import type { DomainTransition, TransitionSummary } from "../types";
import { isDistractionCategory, isProductiveCategory } from "../classification/categoryTypes";
import { mostCommonTransitions } from "../transitions/transitionAnalytics";

export class FocusInterruptionAnalyzer {
  analyze(transitions: DomainTransition[]): TransitionSummary[] {
    return mostCommonTransitions(
      transitions.filter(
        (transition) =>
          isProductiveCategory(transition.fromCategory) &&
          isDistractionCategory(transition.toCategory)
      )
    );
  }
}
