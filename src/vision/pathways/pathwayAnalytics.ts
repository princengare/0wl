import type { PathwaySummary } from "../types";

export function sessionDriftsFromPathways(pathways: PathwaySummary[]): PathwaySummary[] {
  return pathways
    .filter((pathway) => pathway.domains.length >= 3)
    .map((pathway) => ({ ...pathway, id: `drift:${pathway.id}` }))
    .slice(0, 6);
}
