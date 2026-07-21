import type { BlockAttempt } from "@/shared/types";
import { dayOfWeekOf, hourOf } from "../shared/visionTime";
import type { HeatmapCell } from "../types";

export class BlockAttemptHeatmapAnalyzer {
  analyze(attempts: BlockAttempt[]): HeatmapCell[] {
    const cells = new Map<
      string,
      { dayOfWeek: number; hour: number; domains: Map<string, number> }
    >();

    for (const attempt of attempts) {
      const dayOfWeek = dayOfWeekOf(attempt.attemptedAt);
      const hour = hourOf(attempt.attemptedAt);
      const key = `${dayOfWeek}:${hour}`;
      const current = cells.get(key) ?? { dayOfWeek, hour, domains: new Map<string, number>() };
      current.domains.set(
        attempt.domain,
        (current.domains.get(attempt.domain) ?? 0) + attempt.count
      );
      cells.set(key, current);
    }

    return [...cells.values()]
      .map((cell) => {
        const domains = [...cell.domains.entries()]
          .map(([domain, count]) => ({ domain, count }))
          .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));

        return {
          dayOfWeek: cell.dayOfWeek,
          hour: cell.hour,
          count: domains.reduce((sum, row) => sum + row.count, 0),
          domains
        };
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);
  }
}
