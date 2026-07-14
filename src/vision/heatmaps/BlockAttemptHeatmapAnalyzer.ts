import type { BlockAttempt } from "@/shared/types";
import { dayOfWeekOf, hourOf } from "../shared/visionTime";
import type { HeatmapCell } from "../types";

export class BlockAttemptHeatmapAnalyzer {
  analyze(attempts: BlockAttempt[]): HeatmapCell[] {
    const cells = new Map<string, HeatmapCell>();

    for (const attempt of attempts) {
      const dayOfWeek = dayOfWeekOf(attempt.attemptedAt);
      const hour = hourOf(attempt.attemptedAt);
      const key = `${dayOfWeek}:${hour}`;
      const current = cells.get(key) ?? { dayOfWeek, hour, count: 0 };
      cells.set(key, { ...current, count: current.count + attempt.count });
    }

    return [...cells.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);
  }
}
