import type { PathwaySummary } from "../types";

export class BlockEvasionDetector {
  detect(attemptChains: PathwaySummary[]): PathwaySummary[] {
    return attemptChains
      .filter((chain) => chain.count >= 2 || chain.domains.length >= 3)
      .map((chain) => ({ ...chain, id: `evasion:${chain.id}` }))
      .slice(0, 5);
  }
}
