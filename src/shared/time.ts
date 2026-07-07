import type { DailyUsage } from "./types";

export interface DurationSlice {
  dateKey: string;
  durationMs: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function getDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function startOfNextLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

export function splitDurationByLocalDate(startedAt: number, endedAt: number): DurationSlice[] {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    return [];
  }

  const slices: DurationSlice[] = [];
  let cursor = startedAt;

  while (cursor < endedAt) {
    const nextBoundary = startOfNextLocalDay(cursor);
    const sliceEnd = Math.min(endedAt, nextBoundary);
    const durationMs = Math.max(0, sliceEnd - cursor);

    if (durationMs > 0) {
      slices.push({
        dateKey: getDateKey(cursor),
        durationMs
      });
    }

    cursor = sliceEnd;
  }

  return slices;
}

export function minuteBucketKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`;
  }

  return `${seconds}s`;
}

export function formatClockRange(startedAt: number, endedAt: number): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });

  return `${formatter.format(new Date(startedAt))}-${formatter.format(new Date(endedAt))}`;
}

export function addLiveDurationToDailyRows(
  rows: DailyUsage[],
  domain: string | null,
  sessionStartedAt: number | null,
  now: number
): DailyUsage[] {
  if (!domain || !sessionStartedAt || now <= sessionStartedAt) {
    return rows;
  }

  const today = getDateKey(now);
  const liveTodaySlice = splitDurationByLocalDate(sessionStartedAt, now).find(
    (slice) => slice.dateKey === today
  );

  if (!liveTodaySlice) {
    return rows;
  }

  const existing = rows.find((row) => row.domain === domain);

  if (existing) {
    return rows.map((row) =>
      row.domain === domain
        ? {
            ...row,
            durationMs: row.durationMs + liveTodaySlice.durationMs
          }
        : row
    );
  }

  return [
    ...rows,
    {
      id: `${today}::${domain}`,
      dateKey: today,
      domain,
      durationMs: liveTodaySlice.durationMs,
      sessionCount: 0,
      lastUpdatedAt: now
    }
  ];
}
