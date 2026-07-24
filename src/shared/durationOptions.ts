export const TIME_LIMIT_DURATION_MINUTES = [
  1, 5, 10, 15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300
] as const;

export const BREAK_THRESHOLD_DURATION_MINUTES = TIME_LIMIT_DURATION_MINUTES;

export const PRIVATE_TIME_LIMIT_DURATION_MINUTES = [0, ...TIME_LIMIT_DURATION_MINUTES] as const;

export const SCHEDULED_BREAK_DURATION_MINUTES = [
  1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 45, 60
] as const;

export function isScheduledBreakDurationMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= SCHEDULED_BREAK_DURATION_MINUTES[0] &&
    value <= SCHEDULED_BREAK_DURATION_MINUTES[SCHEDULED_BREAK_DURATION_MINUTES.length - 1]
  );
}
