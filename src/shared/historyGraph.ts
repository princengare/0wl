import {
  formatHourRange,
  getDateKey,
  startOfLocalDay,
  startOfLocalWeek,
  startOfNextLocalDay
} from "./time";

export interface SessionLike {
  id?: string;
  domain: string;
  startedAt: number;
  endedAt: number;
}

export interface DomainUsage {
  domain: string;
  durationMs: number;
}

export interface HourlyUsageBucket {
  id: string;
  index: number;
  start: number;
  end: number;
  label: string;
  totalMs: number;
  domains: DomainUsage[];
}

export interface DailyUsageBucket {
  id: string;
  dateKey: string;
  start: number;
  end: number;
  label: string;
  totalMs: number;
  domains: DomainUsage[];
}

export const MIN_VISIBLE_HISTORY_BAR_MS = 1000;

export function hasVisibleHistoryBar(durationMs: number): boolean {
  return durationMs >= MIN_VISIBLE_HISTORY_BAR_MS;
}

function addDomainUsage(map: Map<string, number>, domain: string, durationMs: number): void {
  if (durationMs <= 0) {
    return;
  }

  map.set(domain, (map.get(domain) ?? 0) + durationMs);
}

function sortedDomainUsage(map: Map<string, number>): DomainUsage[] {
  return [...map.entries()]
    .map(([domain, durationMs]) => ({ domain, durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs || a.domain.localeCompare(b.domain));
}

function overlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

export function createHourlyUsageBuckets(
  sessions: SessionLike[],
  dayTimestamp: number
): HourlyUsageBucket[] {
  const dayStart = startOfLocalDay(dayTimestamp);

  return Array.from({ length: 24 }, (_, index) => {
    const start = dayStart + index * 60 * 60 * 1000;
    const end = start + 60 * 60 * 1000;
    const domains = new Map<string, number>();

    for (const session of sessions) {
      addDomainUsage(
        domains,
        session.domain,
        overlap(session.startedAt, session.endedAt, start, end)
      );
    }

    const domainRows = sortedDomainUsage(domains);

    return {
      id: `${getDateKey(start)}::${index}`,
      index,
      start,
      end,
      label: formatHourRange(start),
      totalMs: domainRows.reduce((sum, row) => sum + row.durationMs, 0),
      domains: domainRows
    };
  });
}

export function createCalendarWeekUsageBuckets(
  sessions: SessionLike[],
  weekTimestamp: number
): DailyUsageBucket[] {
  const firstDayStart = startOfLocalWeek(weekTimestamp);
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short"
  });

  return Array.from({ length: 7 }, (_, index) => {
    const start = firstDayStart + index * 24 * 60 * 60 * 1000;
    const end = startOfNextLocalDay(start);
    const domains = new Map<string, number>();

    for (const session of sessions) {
      addDomainUsage(
        domains,
        session.domain,
        overlap(session.startedAt, session.endedAt, start, end)
      );
    }

    const domainRows = sortedDomainUsage(domains);

    return {
      id: getDateKey(start),
      dateKey: getDateKey(start),
      start,
      end,
      label: formatter.format(new Date(start)),
      totalMs: domainRows.reduce((sum, row) => sum + row.durationMs, 0),
      domains: domainRows
    };
  });
}

export function averageDailyUsageMs(buckets: DailyUsageBucket[]): number {
  const nonEmptyBuckets = buckets.filter((bucket) => bucket.totalMs > 0);

  if (nonEmptyBuckets.length === 0) {
    return 0;
  }

  return nonEmptyBuckets.reduce((sum, bucket) => sum + bucket.totalMs, 0) / nonEmptyBuckets.length;
}
