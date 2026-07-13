import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  averageDailyUsageMs,
  createCalendarWeekUsageBuckets,
  createHourlyUsageBuckets,
  type DailyUsageBucket,
  type HourlyUsageBucket
} from "@/shared/historyGraph";
import { getHistoryPanelMode } from "@/shared/historySelection";
import { sendMessage } from "@/shared/messagingClient";
import {
  formatClockRange,
  formatDuration,
  formatHistoryDuration,
  formatDurationMinutes,
  startOfLocalDay,
  startOfLocalWeek
} from "@/shared/time";
import {
  ALL_DAYS,
  ALWAYS_SCHEDULE,
  WEEKDAYS,
  WEEKENDS,
  formatScheduleSummary
} from "@/shared/schedule";
import type {
  BlockedDomain,
  CustomSchedule,
  DayOfWeek,
  ExtensionSettings,
  HistoryRange,
  HistorySessionView,
  ScheduleConfig,
  TimeLimitedDomain,
  TodaySummary
} from "@/shared/types";
import "@/styles/terminal.css";

type Tab = "today" | "history" | "blocked" | "limits" | "settings";
type SettingsChanges = Partial<
  Pick<ExtensionSettings, "trackingEnabled" | "idleThresholdSeconds" | "showBlockedAttemptCount">
>;

const idleOptions = [
  { label: "30 seconds", value: 30 },
  { label: "60 seconds", value: 60 },
  { label: "2 minutes", value: 120 },
  { label: "5 minutes", value: 300 }
] as const;

const timeLimitOptions = [1, 5, 10, 15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300].map(
  (value) => ({ label: formatDurationMinutes(value), value })
);

const dayLabels = ["S", "M", "T", "W", "T", "F", "S"] as const;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function minutesToTimeInput(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeInputToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 9 * 60;
  }

  return Math.max(0, Math.min(1439, hour * 60 + minute));
}

function createCustomSchedule(daysOfWeek: DayOfWeek[] = ALL_DAYS): CustomSchedule {
  return {
    mode: "custom",
    daysOfWeek,
    startMinutes: 9 * 60,
    endMinutes: 17 * 60
  };
}

function ScheduleEditor({
  schedule,
  onChange
}: {
  schedule: ScheduleConfig;
  onChange: (schedule: ScheduleConfig) => void;
}): React.JSX.Element {
  const custom = schedule.mode === "custom" ? schedule : createCustomSchedule();

  function setMode(mode: ScheduleConfig["mode"]): void {
    onChange(mode === "always" ? ALWAYS_SCHEDULE : createCustomSchedule());
  }

  function setDays(daysOfWeek: DayOfWeek[]): void {
    onChange({ ...custom, daysOfWeek });
  }

  function toggleDay(day: DayOfWeek): void {
    const nextDays = custom.daysOfWeek.includes(day)
      ? custom.daysOfWeek.filter((candidate) => candidate !== day)
      : [...custom.daysOfWeek, day].sort((a, b) => a - b);
    onChange({ ...custom, daysOfWeek: nextDays.length > 0 ? nextDays : [day] });
  }

  return (
    <div className="terminal-schedule-editor">
      <div className="terminal-actions">
        <span>Schedule</span>
        <button
          className={`terminal-button ${schedule.mode === "always" ? "active" : ""}`}
          type="button"
          onClick={() => setMode("always")}
        >
          Always
        </button>
        <button
          className={`terminal-button ${schedule.mode === "custom" ? "active" : ""}`}
          type="button"
          onClick={() => setMode("custom")}
        >
          Custom
        </button>
      </div>

      {schedule.mode === "custom" ? (
        <>
          <div className="terminal-actions">
            <span>Days</span>
            <button className="terminal-button" type="button" onClick={() => setDays(ALL_DAYS)}>
              All
            </button>
            <button className="terminal-button" type="button" onClick={() => setDays(WEEKDAYS)}>
              Weekdays
            </button>
            <button className="terminal-button" type="button" onClick={() => setDays(WEEKENDS)}>
              Weekends
            </button>
          </div>

          <div className="terminal-day-buttons" role="group" aria-label="Schedule days">
            {ALL_DAYS.map((day) => (
              <button
                className={`terminal-day-button ${custom.daysOfWeek.includes(day) ? "active" : ""}`}
                key={day}
                type="button"
                aria-pressed={custom.daysOfWeek.includes(day)}
                onClick={() => toggleDay(day)}
              >
                {dayLabels[day]}
              </button>
            ))}
          </div>

          <div className="terminal-time-inputs">
            <label>
              <span>From</span>
              <input
                type="time"
                value={minutesToTimeInput(custom.startMinutes)}
                onChange={(event) =>
                  onChange({ ...custom, startMinutes: timeInputToMinutes(event.target.value) })
                }
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="time"
                value={minutesToTimeInput(custom.endMinutes)}
                onChange={(event) =>
                  onChange({ ...custom, endMinutes: timeInputToMinutes(event.target.value) })
                }
              />
            </label>
          </div>
        </>
      ) : null}
    </div>
  );
}

type UsageBucket = HourlyUsageBucket | DailyUsageBucket;

function UsageBarChart({
  buckets,
  selectedId,
  onSelect,
  averageMs,
  maxMs,
  variant = "week"
}: {
  buckets: UsageBucket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  averageMs?: number;
  maxMs?: number;
  variant?: "hourly" | "week";
}): React.JSX.Element {
  const chartMaxMs = Math.max(
    maxMs ?? 0,
    averageMs ?? 0,
    ...buckets.map((bucket) => bucket.totalMs),
    1
  );
  const averagePercent =
    averageMs !== undefined ? Math.min(100, Math.max(0, (averageMs / chartMaxMs) * 100)) : null;
  const markers =
    variant === "hourly"
      ? [
          { label: "6 AM", left: "25%" },
          { label: "12 PM", left: "50%" },
          { label: "6 PM", left: "75%" }
        ]
      : [];

  return (
    <div
      className={`terminal-chart terminal-chart-${variant}`}
      style={{ "--bar-count": buckets.length } as React.CSSProperties}
    >
      <div className="terminal-chart-bars">
        {markers.map((marker) => (
          <div
            className="terminal-chart-marker"
            key={marker.label}
            style={{ "--marker-left": marker.left } as React.CSSProperties}
            aria-hidden="true"
          >
            <span>{marker.label}</span>
          </div>
        ))}
        {averagePercent !== null ? (
          <>
            <div
              className="terminal-average-line"
              style={{ "--average": `${averagePercent}%` } as React.CSSProperties}
              aria-hidden="true"
            />
            <span
              className="terminal-average-label"
              style={{ "--average": `${averagePercent}%` } as React.CSSProperties}
              aria-hidden="true"
            >
              avg
            </span>
          </>
        ) : null}
        {buckets.map((bucket) => {
          const canSelect = bucket.totalMs > 0;
          const height = canSelect ? Math.max(2, (bucket.totalMs / chartMaxMs) * 100) : 0;
          const label = `${bucket.label}, ${formatHistoryDuration(bucket.totalMs)} browsing time`;
          return (
            <button
              className={`terminal-chart-bar ${selectedId === bucket.id ? "selected" : ""}`}
              key={bucket.id}
              type="button"
              aria-label={label}
              aria-pressed={selectedId === bucket.id}
              disabled={!canSelect}
              title={label}
              onClick={() => onSelect(bucket.id)}
            >
              <span
                className="terminal-chart-bar-fill"
                style={{ "--height": `${height}%` } as React.CSSProperties}
              />
              {variant === "week" ? (
                <span className="terminal-chart-label">{bucket.label}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DomainBreakdown({
  title,
  bucket
}: {
  title: string;
  bucket: UsageBucket;
}): React.JSX.Element {
  return (
    <div className="terminal-selected-breakdown">
      <h2 className="terminal-title">{title}</h2>
      <p>Total browsing: {formatHistoryDuration(bucket.totalMs)}</p>
      <div className="terminal-grid" style={{ marginTop: "1rem" }}>
        {bucket.domains.length > 0 ? (
          bucket.domains.map((row) => (
            <React.Fragment key={row.domain}>
              <span>{row.domain}</span>
              <span>{formatHistoryDuration(row.durationMs)}</span>
            </React.Fragment>
          ))
        ) : (
          <span className="terminal-muted">No tracked browsing in this period</span>
        )}
      </div>
    </div>
  );
}

function TodayPage({ summary }: { summary: TodaySummary | null }): React.JSX.Element {
  const [showDayPercent, setShowDayPercent] = useState(false);
  const totalDurationMs = summary?.totalDurationMs ?? 0;
  const dayDurationMs = 24 * 60 * 60 * 1000;
  const dayPercent = Math.min(100, (totalDurationMs / dayDurationMs) * 100);
  const dayPercentLabel =
    dayPercent > 0 && dayPercent < 0.1
      ? "<0.1% of the day"
      : `${dayPercent.toFixed(1)}% of the day`;

  function showPercent(): void {
    setShowDayPercent(true);
  }

  function hidePercent(): void {
    setShowDayPercent(false);
  }

  return (
    <>
      <section className="terminal-section">
        <h1 className="terminal-title">Today</h1>
        <p className="terminal-kpi">{formatDuration(totalDurationMs)}</p>
        <p>Total browsing time</p>
        <div
          className="terminal-day-progress"
          onMouseEnter={showPercent}
          onMouseLeave={hidePercent}
        >
          <div
            className="terminal-bars"
            style={{ "--fill": `${dayPercent}%` } as React.CSSProperties}
            tabIndex={0}
            onBlur={hidePercent}
            onFocus={showPercent}
          />
          <span className={`terminal-day-percent ${showDayPercent ? "visible" : ""}`}>
            {dayPercentLabel}
          </span>
        </div>
      </section>

      <section className="terminal-section">
        <h2 className="terminal-title">Most Used</h2>
        <div className="terminal-grid">
          {summary && summary.domains.length > 0 ? (
            summary.domains.slice(0, 8).map((row, index) => (
              <React.Fragment key={row.domain}>
                <span>
                  {index + 1}. {row.domain}
                </span>
                <span>{formatDuration(row.durationMs)}</span>
              </React.Fragment>
            ))
          ) : (
            <span className="terminal-muted">No tracked browsing today</span>
          )}
        </div>
      </section>
    </>
  );
}

function HistoryPage(): React.JSX.Element {
  const [range, setRange] = useState<HistoryRange>("today");
  const [weekOffset, setWeekOffset] = useState(0);
  const [sessions, setSessions] = useState<HistorySessionView[]>([]);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [hasPreviousWeekData, setHasPreviousWeekData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - DAY_MS;
  const currentWeekStart = startOfLocalWeek(now);
  const displayedWeekStart = currentWeekStart + weekOffset * WEEK_MS;
  const displayedWeekEnd = displayedWeekStart + WEEK_MS;

  useEffect(() => {
    let mounted = true;
    setSelectedBucketId(null);
    const historyRequest =
      range === "last-7-days"
        ? sendMessage<HistorySessionView[]>({
            type: "GET_HISTORY_INTERVAL",
            startedAt: displayedWeekStart,
            endedAt: displayedWeekEnd
          })
        : sendMessage<HistorySessionView[]>({ type: "GET_HISTORY", range });

    historyRequest
      .then(async (next) => {
        if (range === "last-7-days") {
          const previousStart = displayedWeekStart - WEEK_MS;
          const previous = await sendMessage<HistorySessionView[]>({
            type: "GET_HISTORY_INTERVAL",
            startedAt: previousStart,
            endedAt: displayedWeekStart
          });

          if (mounted) {
            setHasPreviousWeekData(previous.length > 0);
          }
        } else if (mounted) {
          setHasPreviousWeekData(false);
        }

        if (mounted) {
          setSessions(next);
          setError(null);
        }
      })
      .catch((historyError) => {
        if (mounted) {
          setError(
            historyError instanceof Error ? historyError.message : "Unable to load history."
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [displayedWeekEnd, displayedWeekStart, range]);

  const hourlyBuckets = useMemo(
    () => createHourlyUsageBuckets(sessions, range === "yesterday" ? yesterdayStart : now),
    [sessions, range, yesterdayStart, now]
  );
  const dailyBuckets = useMemo(
    () => createCalendarWeekUsageBuckets(sessions, displayedWeekStart),
    [displayedWeekStart, sessions]
  );
  const averageMs = useMemo(() => averageDailyUsageMs(dailyBuckets), [dailyBuckets]);
  const selectedHourlyBucket =
    range === "last-7-days"
      ? null
      : (hourlyBuckets.find((bucket) => bucket.id === selectedBucketId) ?? null);
  const selectedDailyBucket =
    range === "last-7-days"
      ? (dailyBuckets.find((bucket) => bucket.id === selectedBucketId) ?? null)
      : null;
  const panelMode = getHistoryPanelMode(
    range,
    Boolean(selectedHourlyBucket || selectedDailyBucket)
  );
  const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  const weekRangeFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  });
  const weekLabel = `${weekRangeFormatter.format(new Date(displayedWeekStart))}-${weekRangeFormatter.format(
    new Date(displayedWeekEnd - 1)
  )}`;
  const showWeekControls = hasPreviousWeekData || weekOffset < 0;

  return (
    <section className="terminal-section">
      <h1 className="terminal-title">History</h1>
      <div className="terminal-tabs">
        {(["today", "yesterday", "last-7-days"] as const).map((option) => (
          <button
            className={`terminal-button ${range === option ? "active" : ""}`}
            key={option}
            type="button"
            onClick={() => setRange(option)}
          >
            {option === "last-7-days" ? "this week" : option}
          </button>
        ))}
      </div>

      {error ? <p className="terminal-error">{error}</p> : null}

      <div style={{ marginTop: "2rem" }}>
        {range === "last-7-days" ? (
          <>
            {showWeekControls ? (
              <div className="terminal-week-nav">
                <button
                  className="terminal-button"
                  type="button"
                  disabled={!hasPreviousWeekData}
                  onClick={() => setWeekOffset((offset) => offset - 1)}
                >
                  &lt;
                </button>
                <span>{weekLabel}</span>
                <button
                  className="terminal-button"
                  type="button"
                  disabled={weekOffset >= 0}
                  onClick={() => setWeekOffset((offset) => Math.min(0, offset + 1))}
                >
                  &gt;
                </button>
              </div>
            ) : (
              <p>{weekLabel}</p>
            )}
            <p>Average per day: {formatHistoryDuration(averageMs)}</p>
            <UsageBarChart
              buckets={dailyBuckets}
              selectedId={selectedBucketId}
              averageMs={averageMs}
              maxMs={DAY_MS}
              variant="week"
              onSelect={setSelectedBucketId}
            />
            {panelMode === "day-summary" && selectedDailyBucket ? (
              <DomainBreakdown
                title={fullDateFormatter.format(new Date(selectedDailyBucket.start))}
                bucket={selectedDailyBucket}
              />
            ) : (
              <p className="terminal-muted">Select a day to see site totals.</p>
            )}
          </>
        ) : (
          <>
            <UsageBarChart
              buckets={hourlyBuckets}
              selectedId={selectedBucketId}
              maxMs={HOUR_MS}
              variant="hourly"
              onSelect={setSelectedBucketId}
            />
            {panelMode === "hour-summary" && selectedHourlyBucket ? (
              <DomainBreakdown title={selectedHourlyBucket.label} bucket={selectedHourlyBucket} />
            ) : panelMode === "today-sessions" ? (
              <div className="terminal-list" style={{ marginTop: "2rem" }}>
                {sessions.length > 0 ? (
                  sessions.map((session) => (
                    <div className="terminal-list-row" key={session.id}>
                      <span>
                        {formatClockRange(session.startedAt, session.endedAt)} {session.domain}
                      </span>
                      <span>{formatHistoryDuration(session.durationMs)}</span>
                    </div>
                  ))
                ) : (
                  <p className="terminal-muted">No sessions in this range</p>
                )}
              </div>
            ) : (
              <p className="terminal-muted">Select an hour to see site totals.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function BlockedSitesPage({
  settings,
  onSettingsChanged
}: {
  settings: ExtensionSettings | null;
  onSettingsChanged: (settings: ExtensionSettings) => void;
}): React.JSX.Element {
  const [input, setInput] = useState("");
  const [schedule, setSchedule] = useState<ScheduleConfig>(ALWAYS_SCHEDULE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInput, setEditingInput] = useState("");
  const [editingSchedule, setEditingSchedule] = useState<ScheduleConfig>(ALWAYS_SCHEDULE);
  const [error, setError] = useState<string | null>(null);

  async function blockDomain(): Promise<void> {
    try {
      const next = await sendMessage<ExtensionSettings>({
        type: "ADD_BLOCKED_DOMAIN",
        input,
        schedule
      });
      setInput("");
      setSchedule(ALWAYS_SCHEDULE);
      setError(null);
      onSettingsChanged(next);
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : "Unable to block website.");
    }
  }

  async function removeDomain(id: string): Promise<void> {
    const next = await sendMessage<ExtensionSettings>({ type: "REMOVE_BLOCKED_DOMAIN", id });
    onSettingsChanged(next);
  }

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const next = await sendMessage<ExtensionSettings>({
      type: "SET_BLOCKED_DOMAIN_ENABLED",
      id,
      enabled
    });
    onSettingsChanged(next);
  }

  function startEditing(blocked: BlockedDomain): void {
    if (editingId === blocked.id) {
      setEditingId(null);
      return;
    }

    setEditingId(blocked.id);
    setEditingInput(blocked.domain);
    setEditingSchedule(blocked.schedule);
    setError(null);
  }

  async function saveEdit(id: string): Promise<void> {
    try {
      const next = await sendMessage<ExtensionSettings>({
        type: "UPDATE_BLOCKED_DOMAIN",
        id,
        input: editingInput,
        schedule: editingSchedule
      });
      setEditingId(null);
      setError(null);
      onSettingsChanged(next);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Unable to update blocked site.");
    }
  }

  return (
    <section className="terminal-section">
      <h1 className="terminal-title">Blocked Sites</h1>
      <div className="terminal-input-row">
        <input
          aria-label="Website domain"
          placeholder="Enter website..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void blockDomain();
            }
          }}
        />
        <button className="terminal-button" type="button" onClick={() => void blockDomain()}>
          Block
        </button>
      </div>
      <ScheduleEditor schedule={schedule} onChange={setSchedule} />

      {error ? <p className="terminal-error">{error}</p> : null}

      <div className="terminal-list" style={{ marginTop: "2rem" }}>
        {settings?.blockedDomains.length ? (
          settings.blockedDomains.map((blocked) => (
            <div className="terminal-rule" key={blocked.id}>
              <div className="terminal-list-row">
                <span className="terminal-rule-copy">
                  <span>{blocked.domain}</span>
                  <span className="terminal-muted">Blocked</span>
                  <span className="terminal-muted">{formatScheduleSummary(blocked.schedule)}</span>
                </span>
                <span className="terminal-actions">
                  <label className="terminal-toggle">
                    <input
                      type="checkbox"
                      checked={blocked.enabled}
                      onChange={(event) => void setEnabled(blocked.id, event.target.checked)}
                    />
                    {blocked.enabled ? "Active" : "Paused"}
                  </label>
                  <button
                    className="terminal-button"
                    type="button"
                    onClick={() => startEditing(blocked)}
                  >
                    {editingId === blocked.id ? "Close" : "Edit"}
                  </button>
                  <button
                    className="terminal-button"
                    type="button"
                    onClick={() => void removeDomain(blocked.id)}
                  >
                    Remove
                  </button>
                </span>
              </div>
              {editingId === blocked.id ? (
                <div className="terminal-edit-panel">
                  <div className="terminal-input-row">
                    <input
                      aria-label={`Edit blocked website ${blocked.domain}`}
                      value={editingInput}
                      onChange={(event) => setEditingInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void saveEdit(blocked.id);
                        }
                      }}
                    />
                    <button
                      className="terminal-button"
                      type="button"
                      onClick={() => void saveEdit(blocked.id)}
                    >
                      Save
                    </button>
                  </div>
                  <ScheduleEditor schedule={editingSchedule} onChange={setEditingSchedule} />
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="terminal-muted">No blocked websites</p>
        )}
      </div>
    </section>
  );
}

function TimeLimitsPage({
  settings,
  onSettingsChanged
}: {
  settings: ExtensionSettings | null;
  onSettingsChanged: (settings: ExtensionSettings) => void;
}): React.JSX.Element {
  const [input, setInput] = useState("");
  const [limitMinutes, setLimitMinutes] = useState(30);
  const [schedule, setSchedule] = useState<ScheduleConfig>(ALWAYS_SCHEDULE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInput, setEditingInput] = useState("");
  const [editingLimitMinutes, setEditingLimitMinutes] = useState(30);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleConfig>(ALWAYS_SCHEDULE);
  const [error, setError] = useState<string | null>(null);

  async function addLimit(): Promise<void> {
    try {
      const next = await sendMessage<ExtensionSettings>({
        type: "ADD_TIME_LIMITED_DOMAIN",
        input,
        limitMinutes,
        schedule
      });
      setInput("");
      setSchedule(ALWAYS_SCHEDULE);
      setError(null);
      onSettingsChanged(next);
    } catch (limitError) {
      setError(limitError instanceof Error ? limitError.message : "Unable to add time limit.");
    }
  }

  async function removeLimit(id: string): Promise<void> {
    const next = await sendMessage<ExtensionSettings>({
      type: "REMOVE_TIME_LIMITED_DOMAIN",
      id
    });
    onSettingsChanged(next);
  }

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const next = await sendMessage<ExtensionSettings>({
      type: "SET_TIME_LIMITED_DOMAIN_ENABLED",
      id,
      enabled
    });
    onSettingsChanged(next);
  }

  async function updateLimit(
    id: string,
    nextLimitMinutes: number,
    nextSchedule?: ScheduleConfig,
    nextInput?: string
  ): Promise<void> {
    const next = await sendMessage<ExtensionSettings>({
      type: "UPDATE_TIME_LIMITED_DOMAIN",
      id,
      input: nextInput,
      limitMinutes: nextLimitMinutes,
      schedule: nextSchedule
    });
    onSettingsChanged(next);
  }

  function startEditing(limited: TimeLimitedDomain): void {
    if (editingId === limited.id) {
      setEditingId(null);
      return;
    }

    setEditingId(limited.id);
    setEditingInput(limited.domain);
    setEditingLimitMinutes(limited.limitMinutes);
    setEditingSchedule(limited.schedule);
    setError(null);
  }

  async function saveEdit(id: string): Promise<void> {
    try {
      await updateLimit(id, editingLimitMinutes, editingSchedule, editingInput);
      setEditingId(null);
      setError(null);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Unable to update time limit.");
    }
  }

  return (
    <section className="terminal-section">
      <h1 className="terminal-title">Time Limits</h1>
      <div className="terminal-input-row terminal-input-row-three">
        <input
          aria-label="Website domain"
          placeholder="Enter website..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void addLimit();
            }
          }}
        />
        <select
          aria-label="Daily time limit"
          value={limitMinutes}
          onChange={(event) => setLimitMinutes(Number(event.target.value))}
        >
          {timeLimitOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="terminal-button" type="button" onClick={() => void addLimit()}>
          Limit
        </button>
      </div>
      <ScheduleEditor schedule={schedule} onChange={setSchedule} />

      {error ? <p className="terminal-error">{error}</p> : null}

      <div className="terminal-list" style={{ marginTop: "2rem" }}>
        {settings?.timeLimitedDomains.length ? (
          settings.timeLimitedDomains.map((limited) => (
            <div className="terminal-rule" key={limited.id}>
              <div className="terminal-list-row">
                <span className="terminal-rule-copy">
                  <span>{limited.domain}</span>
                  <span className="terminal-muted">
                    {formatDurationMinutes(limited.limitMinutes)} limit
                  </span>
                  <span className="terminal-muted">{formatScheduleSummary(limited.schedule)}</span>
                </span>
                <span className="terminal-actions">
                  <label className="terminal-toggle">
                    <input
                      type="checkbox"
                      checked={limited.enabled}
                      onChange={(event) => void setEnabled(limited.id, event.target.checked)}
                    />
                    {limited.enabled ? "Active" : "Paused"}
                  </label>
                  <button
                    className="terminal-button"
                    type="button"
                    onClick={() => startEditing(limited)}
                  >
                    {editingId === limited.id ? "Close" : "Edit"}
                  </button>
                  <button
                    className="terminal-button"
                    type="button"
                    onClick={() => void removeLimit(limited.id)}
                  >
                    Remove
                  </button>
                </span>
              </div>
              {editingId === limited.id ? (
                <div className="terminal-edit-panel">
                  <div className="terminal-input-row terminal-input-row-three">
                    <input
                      aria-label={`Edit time-limited website ${limited.domain}`}
                      value={editingInput}
                      onChange={(event) => setEditingInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void saveEdit(limited.id);
                        }
                      }}
                    />
                    <select
                      aria-label={`Daily limit for ${limited.domain}`}
                      value={editingLimitMinutes}
                      onChange={(event) => setEditingLimitMinutes(Number(event.target.value))}
                    >
                      {timeLimitOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="terminal-button"
                      type="button"
                      onClick={() => void saveEdit(limited.id)}
                    >
                      Save
                    </button>
                  </div>
                  <ScheduleEditor schedule={editingSchedule} onChange={setEditingSchedule} />
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="terminal-muted">No time limits</p>
        )}
      </div>
    </section>
  );
}

function SettingsPage({
  settings,
  onSettingsChanged
}: {
  settings: ExtensionSettings | null;
  onSettingsChanged: (settings: ExtensionSettings) => void;
}): React.JSX.Element {
  async function updateSettings(changes: SettingsChanges): Promise<void> {
    const next = await sendMessage<ExtensionSettings>({
      type: "UPDATE_SETTINGS",
      changes
    });
    onSettingsChanged(next);
  }

  return (
    <section className="terminal-section">
      <h1 className="terminal-title">Settings</h1>
      <div className="terminal-list">
        <label className="terminal-list-row">
          <span>Tracking enabled</span>
          <input
            type="checkbox"
            checked={settings?.trackingEnabled ?? true}
            onChange={(event) => void updateSettings({ trackingEnabled: event.target.checked })}
          />
        </label>

        <label className="terminal-list-row">
          <span>Idle threshold</span>
          <select
            value={settings?.idleThresholdSeconds ?? 60}
            onChange={(event) =>
              void updateSettings({ idleThresholdSeconds: Number(event.target.value) })
            }
          >
            {idleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="terminal-list-row">
          <span>Show blocked attempt counts</span>
          <input
            type="checkbox"
            checked={settings?.showBlockedAttemptCount ?? true}
            onChange={(event) =>
              void updateSettings({ showBlockedAttemptCount: event.target.checked })
            }
          />
        </label>
      </div>
    </section>
  );
}

function Dashboard(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("today");
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load(): Promise<void> {
      try {
        const [nextSummary, nextSettings] = await Promise.all([
          sendMessage<TodaySummary>({ type: "GET_TODAY_SUMMARY" }),
          sendMessage<ExtensionSettings>({ type: "GET_SETTINGS" })
        ]);

        if (mounted) {
          setSummary(nextSummary);
          setSettings(nextSettings);
          setError(null);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const content = useMemo(() => {
    switch (tab) {
      case "today":
        return <TodayPage summary={summary} />;
      case "history":
        return <HistoryPage />;
      case "blocked":
        return <BlockedSitesPage settings={settings} onSettingsChanged={setSettings} />;
      case "limits":
        return <TimeLimitsPage settings={settings} onSettingsChanged={setSettings} />;
      case "settings":
        return <SettingsPage settings={settings} onSettingsChanged={setSettings} />;
    }
  }, [settings, summary, tab]);

  return (
    <main className="terminal-shell">
      <div className="terminal-frame">
        <header className="terminal-header">
          <span>[0wl]</span>
          <nav className="terminal-tabs" aria-label="Dashboard sections">
            {(["today", "history", "blocked", "limits", "settings"] as const).map((option) => (
              <button
                className={`terminal-button ${tab === option ? "active" : ""}`}
                key={option}
                type="button"
                onClick={() => setTab(option)}
              >
                {option === "blocked"
                  ? "blocked sites"
                  : option === "limits"
                    ? "time limits"
                    : option}
              </button>
            ))}
          </nav>
        </header>

        {error ? <section className="terminal-section terminal-error">{error}</section> : null}
        {content}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Dashboard />);
