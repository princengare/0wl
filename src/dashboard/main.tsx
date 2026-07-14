import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  averageDailyUsageMs,
  createCalendarWeekUsageBuckets,
  createHourlyUsageBuckets,
  hasVisibleHistoryBar,
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
import type {
  DomainCategory,
  DomainClassification,
  FrictionLevel,
  VisionRecommendation,
  VisionReport,
  VisionSettings
} from "@/vision/types";
import "@/styles/terminal.css";

type Tab = "today" | "history" | "blocked" | "limits" | "vision" | "settings";
type VisionTab = "patterns" | "insights" | "recommendations" | "categories";
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
const domainCategories: DomainCategory[] = [
  "focus",
  "coding",
  "school",
  "research",
  "communication",
  "neutral",
  "mixed",
  "entertainment",
  "social",
  "distraction"
];
const frictionLevels: FrictionLevel[] = [0, 1, 2, 3, 4];

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

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${value.toFixed(value > 0 && value < 1 ? 1 : 0)}%`;
}

function formatFrictionLevel(level: FrictionLevel): string {
  switch (level) {
    case 0:
      return "Off";
    case 1:
      return "Pause";
    case 2:
      return "Intent";
    case 3:
      return "Delay";
    case 4:
      return "Hard stop";
  }
}

function TerminalCheckbox({
  checked,
  onChange,
  ariaLabel
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}): React.JSX.Element {
  return (
    <span className="terminal-checkbox">
      <input
        aria-label={ariaLabel}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="terminal-checkbox-box" aria-hidden="true">
        [{checked ? "✓" : " "}]
      </span>
    </span>
  );
}

interface TerminalSelectOption<T extends string | number> {
  label: string;
  value: T;
}

function TerminalSelect<T extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
  width = "100%"
}: {
  ariaLabel: string;
  value: T;
  options: readonly TerminalSelectOption<T>[];
  onChange: (value: T) => void;
  width?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => Object.is(option.value, value)) ?? options[0];

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectOption(nextValue: T): void {
    onChange(nextValue);
    setOpen(false);
  }

  return (
    <div className="terminal-select" ref={rootRef} style={{ width }}>
      <button
        className="terminal-select-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? ""}</span>
        <span aria-hidden="true">v</span>
      </button>
      {open ? (
        <div className="terminal-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              className={`terminal-select-option ${
                Object.is(option.value, value) ? "selected" : ""
              }`}
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={Object.is(option.value, value)}
              onClick={() => selectOption(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
const HISTORY_CHART_HEIGHT_PX = 220;

function VisionHelpPopup({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="terminal-help-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="terminal-help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vision-help-title"
      >
        <div className="terminal-help-header">
          <h2 className="terminal-title" id="vision-help-title">
            Help[?]
          </h2>
          <button
            className="terminal-help-close"
            type="button"
            aria-label="Close vision help"
            onClick={onClose}
          >
            [x]
          </button>
        </div>
        <div className="terminal-help-grid">
          <section>
            <h3>Patterns</h3>
            <p>Shows paths you often take from focus sites to distraction sites.</p>
          </section>
          <section>
            <h3>Common transitions</h3>
            <p>Shows which websites you jump between a lot.</p>
          </section>
          <section>
            <h3>Focus interruptions</h3>
            <p>Shows when a focus site is followed by a distraction site.</p>
          </section>
          <section>
            <h3>Drift and evasion</h3>
            <p>Shows when distraction keeps moving or works around blocks.</p>
          </section>
          <section>
            <h3>Insights</h3>
            <p>Turns your local history into simple clues about your habits.</p>
          </section>
          <section>
            <h3>Pre-distraction context</h3>
            <p>Shows what you were doing right before a distraction.</p>
          </section>
          <section>
            <h3>Recommendations</h3>
            <p>Shows small ideas 0wl can use to help you pause.</p>
          </section>
          <section>
            <h3>Friction rules</h3>
            <p>Adds a pause, question, delay, or stop before a site opens.</p>
          </section>
          <section>
            <h3>Site categories</h3>
            <p>Tells 0wl what kind of site each website is. You can fix wrong labels.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

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
  const averageOffsetPx =
    averagePercent !== null ? (averagePercent / 100) * HISTORY_CHART_HEIGHT_PX : null;
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
      style={
        {
          "--bar-count": buckets.length,
          "--chart-height": `${HISTORY_CHART_HEIGHT_PX}px`
        } as React.CSSProperties
      }
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
        {averageOffsetPx !== null ? (
          <>
            <div
              className="terminal-average-line"
              style={{ "--average-offset": `${averageOffsetPx}px` } as React.CSSProperties}
              aria-hidden="true"
            />
            <span
              className="terminal-average-label"
              style={{ "--average-offset": `${averageOffsetPx}px` } as React.CSSProperties}
              aria-hidden="true"
            >
              avg
            </span>
          </>
        ) : null}
        {buckets.map((bucket) => {
          const canSelect = hasVisibleHistoryBar(bucket.totalMs);
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
                    <TerminalCheckbox
                      checked={blocked.enabled}
                      onChange={(checked) => void setEnabled(blocked.id, checked)}
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
        <TerminalSelect
          ariaLabel="Daily time limit"
          value={limitMinutes}
          options={timeLimitOptions}
          onChange={setLimitMinutes}
        />
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
                    <TerminalCheckbox
                      checked={limited.enabled}
                      onChange={(checked) => void setEnabled(limited.id, checked)}
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
                    <TerminalSelect
                      ariaLabel={`Daily limit for ${limited.domain}`}
                      value={editingLimitMinutes}
                      options={timeLimitOptions}
                      onChange={setEditingLimitMinutes}
                    />
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

function SummaryList({
  empty,
  children
}: {
  empty: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="terminal-list">
      {React.Children.count(children) > 0 ? children : <p className="terminal-muted">{empty}</p>}
    </div>
  );
}

function RecommendationRow({
  recommendation,
  onApply,
  onDismiss
}: {
  recommendation: VisionRecommendation;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="terminal-rule">
      <div className="terminal-list-row">
        <span className="terminal-rule-copy">
          <span>{recommendation.title}</span>
          <span className="terminal-muted">{recommendation.reason}</span>
          <span className="terminal-muted">{recommendation.supportingMetric}</span>
          <span>{recommendation.proposedAction}</span>
        </span>
        <span className="terminal-actions">
          {recommendation.action.type !== "none" ? (
            <button
              className="terminal-button"
              type="button"
              onClick={() => onApply(recommendation.id)}
            >
              Apply
            </button>
          ) : null}
          <button
            className="terminal-button"
            type="button"
            onClick={() => onDismiss(recommendation.id)}
          >
            Dismiss
          </button>
        </span>
      </div>
    </div>
  );
}

function CategorySelect({
  value,
  onChange
}: {
  value: DomainCategory;
  onChange: (category: DomainCategory) => void;
}): React.JSX.Element {
  return (
    <TerminalSelect
      ariaLabel="Domain category"
      value={value}
      options={domainCategories.map((category) => ({ label: category, value: category }))}
      onChange={onChange}
      width="min(100%, 13rem)"
    />
  );
}

function VisionPage(): React.JSX.Element {
  const [visionTab, setVisionTab] = useState<VisionTab>("patterns");
  const [showVisionHelp, setShowVisionHelp] = useState(false);
  const [report, setReport] = useState<VisionReport | null>(null);
  const [frictionInput, setFrictionInput] = useState("");
  const [frictionLevel, setFrictionLevel] = useState<FrictionLevel>(1);
  const [frictionSchedule, setFrictionSchedule] = useState<ScheduleConfig>(ALWAYS_SCHEDULE);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(): Promise<void> {
    try {
      setReport(await sendMessage<VisionReport>({ type: "GET_VISION_REPORT" }));
      setError(null);
    } catch (visionError) {
      setError(visionError instanceof Error ? visionError.message : "Unable to load vision.");
    }
  }

  useEffect(() => {
    void loadReport();
  }, []);

  async function setCategory(domain: string, primaryCategory: DomainCategory): Promise<void> {
    setReport(
      await sendMessage<VisionReport>({
        type: "SET_DOMAIN_CLASSIFICATION",
        domain,
        primaryCategory
      })
    );
  }

  async function resetCategory(domain: string): Promise<void> {
    setReport(await sendMessage<VisionReport>({ type: "RESET_DOMAIN_CLASSIFICATION", domain }));
  }

  async function updateVisionSettings(changes: Partial<VisionSettings>): Promise<void> {
    await sendMessage<VisionSettings>({ type: "UPDATE_VISION_SETTINGS", changes });
    await loadReport();
  }

  async function dismissRecommendation(id: string): Promise<void> {
    setReport(await sendMessage<VisionReport>({ type: "DISMISS_VISION_RECOMMENDATION", id }));
  }

  async function applyRecommendation(id: string): Promise<void> {
    setReport(await sendMessage<VisionReport>({ type: "APPLY_VISION_RECOMMENDATION", id }));
  }

  async function saveFrictionRule(
    domain: string,
    level: FrictionLevel,
    schedule: ScheduleConfig,
    enabled = true
  ): Promise<void> {
    try {
      setReport(
        await sendMessage<VisionReport>({
          type: "UPSERT_FRICTION_RULE",
          domain,
          level,
          schedule,
          enabled
        })
      );
      setFrictionInput("");
      setFrictionSchedule(ALWAYS_SCHEDULE);
      setError(null);
    } catch (frictionError) {
      setError(frictionError instanceof Error ? frictionError.message : "Unable to save friction.");
    }
  }

  async function removeFrictionRule(id: string): Promise<void> {
    setReport(await sendMessage<VisionReport>({ type: "REMOVE_FRICTION_RULE", id }));
  }

  const settings = report?.settings;
  const classified = report?.classifiedDomains ?? [];
  const unclassified = report?.unclassifiedDomains ?? [];

  return (
    <section className="terminal-section">
      <h1 className="terminal-title">Vision</h1>
      <div className="terminal-tabs">
        {(["patterns", "insights", "recommendations", "categories"] as const).map((option) => (
          <button
            className={`terminal-button ${visionTab === option ? "active" : ""}`}
            key={option}
            type="button"
            onClick={() => setVisionTab(option)}
          >
            {option === "categories" ? "site categories" : option}
          </button>
        ))}
        <button
          className={`terminal-help-button ${showVisionHelp ? "active" : ""}`}
          type="button"
          aria-label="Explain vision sections"
          aria-expanded={showVisionHelp}
          onClick={() => setShowVisionHelp((current) => !current)}
        >
          [?]
        </button>
      </div>

      {showVisionHelp ? <VisionHelpPopup onClose={() => setShowVisionHelp(false)} /> : null}

      {error ? <p className="terminal-error">{error}</p> : null}
      {!report ? <p className="terminal-muted">Loading local patterns...</p> : null}

      {report && visionTab === "patterns" ? (
        <div className="terminal-vision-grid">
          <section>
            <h2 className="terminal-title">Distraction pathways</h2>
            <SummaryList empty="No pathways detected yet.">
              {report.pathways.map((pathway) => (
                <div className="terminal-list-row" key={pathway.id}>
                  <span>{pathway.domains.join(" -> ")}</span>
                  <span>{pathway.count}x</span>
                </div>
              ))}
            </SummaryList>
          </section>

          <section>
            <h2 className="terminal-title">Common transitions</h2>
            <SummaryList empty="No transitions recorded yet.">
              {report.transitions.slice(0, 8).map((transition) => (
                <div className="terminal-list-row" key={transition.id}>
                  <span>{`${transition.fromDomain} -> ${transition.toDomain}`}</span>
                  <span>{transition.count}x</span>
                </div>
              ))}
            </SummaryList>
          </section>

          <section>
            <h2 className="terminal-title">Focus interruptions</h2>
            <SummaryList empty="No focus interruptions detected yet.">
              {report.focusInterruptions.map((transition) => (
                <div className="terminal-list-row" key={transition.id}>
                  <span>{`${transition.fromDomain} -> ${transition.toDomain}`}</span>
                  <span>{transition.count}x</span>
                </div>
              ))}
            </SummaryList>
          </section>

          <section>
            <h2 className="terminal-title">Drift and evasion</h2>
            <SummaryList empty="No drift or evasion patterns yet.">
              {[...report.sessionDrifts, ...report.blockEvasions].map((pathway) => (
                <div className="terminal-list-row" key={pathway.id}>
                  <span>{pathway.domains.join(" -> ")}</span>
                  <span>{formatHistoryDuration(pathway.averageDiversionMs)}</span>
                </div>
              ))}
            </SummaryList>
          </section>
        </div>
      ) : null}

      {report && visionTab === "insights" ? (
        <div className="terminal-vision-grid">
          <section>
            <h2 className="terminal-title">Trends</h2>
            <div className="terminal-grid">
              <span>Today distraction</span>
              <span>{formatHistoryDuration(report.trends.dailyDistractionMs)}</span>
              <span>This week distraction</span>
              <span>{formatHistoryDuration(report.trends.weeklyDistractionMs)}</span>
              <span>This month distraction</span>
              <span>{formatHistoryDuration(report.trends.monthlyDistractionMs)}</span>
              <span>Blocked attempts</span>
              <span>{report.trends.blockedAttemptCount}</span>
              <span>Bounce back</span>
              <span>{formatPercent(report.bounceBackRate)}</span>
              <span>Net time reclaimed</span>
              <span>{formatHistoryDuration(report.netTimeReclaimedMsPerDay)} / day</span>
            </div>
          </section>

          <section>
            <h2 className="terminal-title">Personal insights</h2>
            <SummaryList empty="Insights appear after more local history is available.">
              {report.insights.map((insight) => (
                <div className="terminal-rule" key={insight.id}>
                  <span>{insight.text}</span>
                  <span className="terminal-muted">{insight.supportingMetric}</span>
                  {insight.suggestedAction ? <span>{insight.suggestedAction}</span> : null}
                </div>
              ))}
            </SummaryList>
          </section>

          <section>
            <h2 className="terminal-title">Pre-distraction context</h2>
            <SummaryList empty="No recurring context detected yet.">
              {report.contexts.map((context) => (
                <div className="terminal-rule" key={context.domain}>
                  <span>{context.domain}</span>
                  <span className="terminal-muted">
                    after {context.previousCategories[0]?.category ?? "unknown"} (
                    {formatPercent(context.previousCategories[0]?.percent ?? 0)})
                  </span>
                </div>
              ))}
            </SummaryList>
          </section>

          <section>
            <h2 className="terminal-title">Block outcomes</h2>
            <SummaryList empty="No blocked-site outcomes yet.">
              {report.blockOutcomes.map((outcome) => (
                <div className="terminal-rule" key={outcome.domain}>
                  <span>{outcome.domain}</span>
                  <span className="terminal-muted">
                    focus {formatPercent(outcome.returnedToFocusPercent)} / substitute{" "}
                    {formatPercent(outcome.substituteDistractionPercent)}
                  </span>
                </div>
              ))}
            </SummaryList>
          </section>
        </div>
      ) : null}

      {report && visionTab === "recommendations" && settings ? (
        <div className="terminal-vision-grid">
          <section>
            <h2 className="terminal-title">Adaptive settings</h2>
            <div className="terminal-list">
              <label className="terminal-list-row">
                <span>Adaptive recommendations</span>
                <TerminalCheckbox
                  checked={settings.adaptiveRecommendationsEnabled}
                  onChange={(checked) =>
                    void updateVisionSettings({
                      adaptiveRecommendationsEnabled: checked
                    })
                  }
                />
              </label>
              <label className="terminal-list-row">
                <span>Adaptive enforcement</span>
                <TerminalCheckbox
                  checked={settings.adaptiveEnforcementEnabled}
                  onChange={(checked) =>
                    void updateVisionSettings({
                      adaptiveEnforcementEnabled: checked
                    })
                  }
                />
              </label>
              <div className="terminal-list-row">
                <span>Max automatic friction</span>
                <TerminalSelect
                  ariaLabel="Max automatic friction"
                  value={settings.maxAutomaticFrictionLevel}
                  options={frictionLevels.map((level) => ({
                    label: formatFrictionLevel(level),
                    value: level
                  }))}
                  onChange={(level) =>
                    void updateVisionSettings({
                      maxAutomaticFrictionLevel: level
                    })
                  }
                  width="min(100%, 13rem)"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="terminal-title">Recommendations</h2>
            <SummaryList empty="No recommendations yet.">
              {report.recommendations.map((recommendation) => (
                <RecommendationRow
                  key={recommendation.id}
                  recommendation={recommendation}
                  onApply={(id) => void applyRecommendation(id)}
                  onDismiss={(id) => void dismissRecommendation(id)}
                />
              ))}
            </SummaryList>
          </section>

          <section>
            <h2 className="terminal-title">Friction rules</h2>
            <div className="terminal-input-row terminal-input-row-three">
              <input
                aria-label="Friction website domain"
                placeholder="Enter website..."
                value={frictionInput}
                onChange={(event) => setFrictionInput(event.target.value)}
              />
              <TerminalSelect
                ariaLabel="Friction level"
                value={frictionLevel}
                options={frictionLevels.map((level) => ({
                  label: formatFrictionLevel(level),
                  value: level
                }))}
                onChange={setFrictionLevel}
              />
              <button
                className="terminal-button"
                type="button"
                onClick={() =>
                  void saveFrictionRule(frictionInput, frictionLevel, frictionSchedule)
                }
              >
                Save
              </button>
            </div>
            <ScheduleEditor schedule={frictionSchedule} onChange={setFrictionSchedule} />
            <div className="terminal-list" style={{ marginTop: "1rem" }}>
              {settings.frictionRules.length > 0 ? (
                settings.frictionRules.map((rule) => (
                  <div className="terminal-rule" key={rule.id}>
                    <div className="terminal-list-row">
                      <span className="terminal-rule-copy">
                        <span>{rule.domain}</span>
                        <span className="terminal-muted">{formatFrictionLevel(rule.level)}</span>
                        <span className="terminal-muted">
                          {formatScheduleSummary(rule.schedule)}
                        </span>
                      </span>
                      <span className="terminal-actions">
                        <label className="terminal-toggle">
                          <TerminalCheckbox
                            checked={rule.enabled}
                            onChange={(checked) =>
                              void saveFrictionRule(rule.domain, rule.level, rule.schedule, checked)
                            }
                          />
                          {rule.enabled ? "Active" : "Paused"}
                        </label>
                        <button
                          className="terminal-button"
                          type="button"
                          onClick={() => void removeFrictionRule(rule.id)}
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="terminal-muted">No friction rules</p>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {report && visionTab === "categories" ? (
        <div className="terminal-vision-grid">
          <section>
            <h2 className="terminal-title">Classified sites</h2>
            <p className="terminal-muted">{report.seedClassificationCount} seed classifications</p>
            <SummaryList empty="No classified visited sites yet.">
              {classified.map((classification: DomainClassification) => (
                <div className="terminal-list-row" key={classification.domain}>
                  <span className="terminal-rule-copy">
                    <span>{classification.domain}</span>
                    <span className="terminal-muted">
                      {classification.source} / {classification.confidence.toFixed(2)}
                    </span>
                  </span>
                  <span className="terminal-actions">
                    <CategorySelect
                      value={classification.primaryCategory}
                      onChange={(category) => void setCategory(classification.domain, category)}
                    />
                    {classification.source === "user" ? (
                      <button
                        className="terminal-button"
                        type="button"
                        onClick={() => void resetCategory(classification.domain)}
                      >
                        Reset
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </SummaryList>
          </section>

          <section>
            <h2 className="terminal-title">Unclassified sites</h2>
            <SummaryList empty="No unclassified visited sites yet.">
              {unclassified.map((domain) => (
                <div className="terminal-list-row" key={domain}>
                  <span>{domain}</span>
                  <CategorySelect
                    value="neutral"
                    onChange={(category) => void setCategory(domain, category)}
                  />
                </div>
              ))}
            </SummaryList>
          </section>
        </div>
      ) : null}
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
          <TerminalCheckbox
            checked={settings?.trackingEnabled ?? true}
            onChange={(checked) => void updateSettings({ trackingEnabled: checked })}
          />
        </label>

        <div className="terminal-list-row">
          <span>Idle threshold</span>
          <TerminalSelect
            ariaLabel="Idle threshold"
            value={settings?.idleThresholdSeconds ?? 60}
            options={idleOptions}
            onChange={(idleThresholdSeconds) => void updateSettings({ idleThresholdSeconds })}
            width="min(100%, 13rem)"
          />
        </div>

        <label className="terminal-list-row">
          <span>Show blocked attempt counts</span>
          <TerminalCheckbox
            checked={settings?.showBlockedAttemptCount ?? true}
            onChange={(checked) => void updateSettings({ showBlockedAttemptCount: checked })}
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
      case "vision":
        return <VisionPage />;
      case "settings":
        return <SettingsPage settings={settings} onSettingsChanged={setSettings} />;
    }
  }, [settings, summary, tab]);

  return (
    <main className="terminal-shell">
      <div className="terminal-frame">
        <header className="terminal-header">
          <span>[0wl]</span>
          <nav className="terminal-tabs terminal-dashboard-tabs" aria-label="Dashboard sections">
            {(["today", "history", "blocked", "limits", "vision", "settings"] as const).map(
              (option) => (
                <button
                  className={`terminal-button ${tab === option ? "active" : ""}`}
                  key={option}
                  type="button"
                  aria-label={option === "settings" ? "settings" : undefined}
                  title={option === "settings" ? "settings" : undefined}
                  onClick={() => setTab(option)}
                >
                  {option === "blocked"
                    ? "blocked sites"
                    : option === "limits"
                      ? "time limits"
                      : option === "settings"
                        ? "⚙"
                        : option}
                </button>
              )
            )}
          </nav>
        </header>

        {error ? <section className="terminal-section terminal-error">{error}</section> : null}
        {content}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Dashboard />);
