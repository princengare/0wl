import type { BlockOutcomeSummary } from "../types";

export class BounceBackAnalyzer {
  rate(outcomes: BlockOutcomeSummary[]): number {
    const attempts = outcomes.reduce((sum, outcome) => sum + outcome.attempts, 0);

    if (attempts === 0) {
      return 0;
    }

    return (
      outcomes.reduce(
        (sum, outcome) => sum + outcome.attempts * (outcome.returnedToFocusPercent / 100),
        0
      ) / attempts
    );
  }
}
