import { formatDuration } from "@/shared/time";
import type { PathwaySummary } from "../types";

export function sessionDriftsFromPathways(pathways: PathwaySummary[]): PathwaySummary[] {
  return pathways
    .filter(
      (pathway) =>
        Boolean(pathway.firstDistractionDomain) &&
        ((pathway.rawDomains?.length ?? pathway.domains.length) >= 3 ||
          (pathway.includedFocusDomains?.length ?? 0) >= 2)
    )
    .map((pathway) => ({
      ...pathway,
      id: `drift:${pathway.id}`,
      displayLabel: pathway.displayLabel ?? pathway.domains.join(" -> "),
      details: [
        ...(pathway.details ?? []),
        {
          label: "time before drift",
          value: formatDuration(pathway.averageTimeBeforeDistractionMs ?? 0)
        },
        {
          label: "diversion duration",
          value: formatDuration(pathway.averageDiversionMs)
        },
        {
          label: "included domains",
          value: (pathway.rawDomains ?? pathway.domains).join(" -> ")
        }
      ]
    }))
    .slice(0, 6);
}
