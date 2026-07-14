import type { SubstitutionSummary } from "../types";

export class NetTimeReclaimedAnalyzer {
  total(substitutions: SubstitutionSummary[]): number {
    return substitutions.reduce(
      (sum, substitution) => sum + Math.max(0, substitution.netReclaimedMsPerDay),
      0
    );
  }
}
