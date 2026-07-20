import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  canDrillIntoHistoryMode,
  DEFAULT_HISTORY_MODE,
  historyModeEmptyState,
  historyModeToScope,
  historyModeToUsageMode,
  toggleHistoryMode,
  type HistoryModeButton
} from "@/shared/historyModes";
import { browser } from "@/shared/browser";
import { APP_PRIVACY_POLICY_URL } from "@/shared/appSurface";
import { getPrivateWindowAccessStatus, normalizeWindowScope } from "@/platform/windowScope";
import { getBrowserTarget } from "@/platform/browserTarget";
import { ExtensionFooter } from "@/shared/ExtensionFooter";
import { sendMessage } from "@/shared/messagingClient";
import {
  getTimeLimitPlaceholders,
  PLACEHOLDER_ALT_HOLD_MS,
  PLACEHOLDER_INITIAL_DELAY_MS,
  PLACEHOLDER_TYPE_INTERVAL_MS,
  typedPlaceholderAtElapsed
} from "@/shared/placeholders";
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
  DataBackup,
  DataControlStatus,
  DataDeleteTarget,
  DataExportResult,
  DataImportMode,
  DayOfWeek,
  ExtensionSettings,
  HistoryRetentionDays,
  HistoryRange,
  HistorySessionView,
  ScheduleConfig,
  TimeLimitedDomain,
  TodaySummary,
  HistoryModeSelection,
  WindowScope
} from "@/shared/types";
import type {
  DomainCategory,
  DomainClassification,
  FrictionLevel,
  PathwaySummary,
  VisionRecommendation,
  VisionReport,
  VisionSettings
} from "@/vision/types";
import "@/styles/terminal.css";

type Tab = "today" | "history" | "blocked" | "limits" | "vision" | "settings";
type VisionTab = "patterns" | "insights" | "recommendations" | "categories";
type SettingsChanges = Partial<
  Pick<
    ExtensionSettings,
    | "trackingEnabled"
    | "privateBrowserTrackingEnabled"
    | "idleThresholdSeconds"
    | "showBlockedAttemptCount"
    | "historyRetentionDays"
  >
>;

const idleOptions = [
  { label: "30 seconds", value: 30 },
  { label: "60 seconds", value: 60 },
  { label: "2 minutes", value: 120 },
  { label: "5 minutes", value: 300 }
] as const;

const retentionOptions = [
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "6 months", value: "180" },
  { label: "1 year", value: "365" },
  { label: "Forever", value: "forever" }
] as const;

const deleteSpecificOptions: Array<{
  label: string;
  value: Exclude<DataDeleteTarget, "settings">;
}> = [
  { label: "Delete Browsing History", value: "browsing-history" },
  { label: "Delete Blocked Attempts", value: "blocked-attempts" },
  { label: "Delete Vision Analytics", value: "vision-analytics" },
  { label: "Reset Custom Site Categories", value: "custom-site-categories" }
];

const regularTimeLimitMinutes = [
  1, 5, 10, 15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300
] as const;
const privateTimeLimitMinutes = [0, ...regularTimeLimitMinutes] as const;
const timeLimitOptions = regularTimeLimitMinutes.map((value) => ({
  label: formatDurationMinutes(value),
  value
}));
const privateTimeLimitOptions = privateTimeLimitMinutes.map((value) => ({
  label: formatDurationMinutes(value),
  value
}));

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
const DASHBOARD_BRAND_MODE_STORAGE_KEY = "0wl:dashboard-brand-mode";

function isDashboardTab(value: string | null): value is Tab {
  return (
    value === "today" ||
    value === "history" ||
    value === "blocked" ||
    value === "limits" ||
    value === "vision" ||
    value === "settings"
  );
}

function readInitialTab(): Tab {
  const params = new URLSearchParams(window.location.search);
  const queryTab = params.get("tab");

  if (isDashboardTab(queryTab)) {
    return queryTab;
  }

  const hashTab = window.location.hash.replace(/^#/, "");
  return isDashboardTab(hashTab) ? hashTab : "today";
}

function readInitialBrandMode(): "text" | "icon" {
  return window.localStorage.getItem(DASHBOARD_BRAND_MODE_STORAGE_KEY) === "icon" ? "icon" : "text";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatRecordDate(timestamp: number | null): string {
  if (timestamp === null) {
    return "none";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function retentionToSelectValue(value: HistoryRetentionDays): string {
  return value === null ? "forever" : String(value);
}

function selectValueToRetention(value: string): HistoryRetentionDays {
  if (value === "forever") {
    return null;
  }

  const days = Number(value);
  return days === 30 || days === 90 || days === 180 || days === 365 ? days : 365;
}

function downloadBackup(result: DataExportResult): void {
  const blob = new Blob([JSON.stringify(result.backup, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

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

function timeLimitDisplayName(limited: TimeLimitedDomain): string {
  if (limited.targetType === "global") {
    return limited.windowScope === "private" ? "All Private Browsing" : "All Browsing";
  }

  return limited.domain ?? "All Browsing";
}

function useCyclingTypedPlaceholder(inputValue: string, privateMode = false): string {
  const { defaultPlaceholder, alternatePlaceholder } = getTimeLimitPlaceholders(privateMode);
  const [placeholder, setPlaceholder] = useState(defaultPlaceholder);

  useEffect(() => {
    if (inputValue.length > 0) {
      setPlaceholder(defaultPlaceholder);
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = new Set<number>();
    let cancelled = false;

    function schedule(callback: () => void, delay: number): void {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
    }

    function cycle(): void {
      if (cancelled) {
        return;
      }

      setPlaceholder(defaultPlaceholder);
      schedule(() => {
        if (cancelled) {
          return;
        }

        if (prefersReducedMotion) {
          setPlaceholder(
            typedPlaceholderAtElapsed(
              PLACEHOLDER_INITIAL_DELAY_MS,
              defaultPlaceholder,
              alternatePlaceholder,
              true
            )
          );
          schedule(cycle, PLACEHOLDER_ALT_HOLD_MS);
          return;
        }

        let index = 0;

        function typeNext(): void {
          if (cancelled) {
            return;
          }

          index += 1;
          setPlaceholder(
            typedPlaceholderAtElapsed(
              PLACEHOLDER_INITIAL_DELAY_MS + (index - 1) * PLACEHOLDER_TYPE_INTERVAL_MS,
              defaultPlaceholder,
              alternatePlaceholder
            )
          );

          if (index < alternatePlaceholder.length) {
            schedule(typeNext, PLACEHOLDER_TYPE_INTERVAL_MS);
            return;
          }

          schedule(cycle, PLACEHOLDER_ALT_HOLD_MS);
        }

        setPlaceholder("");
        schedule(typeNext, PLACEHOLDER_TYPE_INTERVAL_MS);
      }, PLACEHOLDER_INITIAL_DELAY_MS);
    }

    cycle();

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [alternatePlaceholder, defaultPlaceholder, inputValue]);

  return placeholder;
}

function PrivateScopeToggle({
  activeScope,
  onToggle
}: {
  activeScope: WindowScope;
  onToggle: () => void;
}): React.JSX.Element {
  const privateActive = activeScope === "private";

  return (
    <button
      className={`terminal-private-toggle ${privateActive ? "active" : ""}`}
      type="button"
      aria-label={privateActive ? "Showing private window rules" : "Show private window rules"}
      aria-pressed={privateActive}
      title={privateActive ? "Private Windows" : "Regular Windows"}
      onClick={onToggle}
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" focusable="false" role="img">
        <path d="M7 14h18l-3-8H10l-3 8Z" />
        <path d="M5 14h22" />
        <circle cx="11" cy="21" r="3.5" />
        <circle cx="21" cy="21" r="3.5" />
        <path d="M14.5 21h3" />
      </svg>
    </button>
  );
}

function HistoryModeToggle({
  button,
  active,
  onClick
}: {
  button: HistoryModeButton;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const labels: Record<HistoryModeButton, string> = {
    private: active ? "Showing private browsing history" : "Show private browsing history",
    pip: active
      ? "Showing Picture-in-Picture media history"
      : "Show Picture-in-Picture media history",
    background: active ? "Showing background media history" : "Show background media history"
  };

  return (
    <button
      className={`terminal-private-toggle ${active ? "active" : ""}`}
      type="button"
      aria-label={labels[button]}
      aria-pressed={active}
      title={labels[button]}
      onClick={onClick}
    >
      {button === "private" ? (
        <svg aria-hidden="true" viewBox="0 0 32 32" focusable="false" role="img">
          <path d="M7 14h18l-3-8H10l-3 8Z" />
          <path d="M5 14h22" />
          <circle cx="11" cy="21" r="3.5" />
          <circle cx="21" cy="21" r="3.5" />
          <path d="M14.5 21h3" />
        </svg>
      ) : button === "pip" ? (
        <svg aria-hidden="true" viewBox="0 0 32 32" focusable="false" role="img">
          <rect x="5" y="7" width="22" height="16" rx="1" />
          <rect x="16" y="14" width="8" height="6" rx="1" />
          <path d="M9 25h14" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 32 32" focusable="false" role="img">
          <path d="M8 22a8 8 0 0 1 16 0" />
          <path d="M8 22v-5a8 8 0 0 1 16 0v5" />
          <rect x="5" y="20" width="5" height="7" rx="1" />
          <rect x="22" y="20" width="5" height="7" rx="1" />
        </svg>
      )}
    </button>
  );
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
  variant = "week",
  selectable = true
}: {
  buckets: UsageBucket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  averageMs?: number;
  maxMs?: number;
  variant?: "hourly" | "week";
  selectable?: boolean;
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
          const hasVisibleData = hasVisibleHistoryBar(bucket.totalMs);
          const canSelect = selectable && hasVisibleData;
          const height = hasVisibleData ? Math.max(2, (bucket.totalMs / chartMaxMs) * 100) : 0;
          const label = `${bucket.label}, ${formatHistoryDuration(bucket.totalMs)} browsing time`;
          return (
            <button
              className={`terminal-chart-bar ${selectedId === bucket.id ? "selected" : ""} ${
                hasVisibleData && !selectable ? "nonselectable" : ""
              }`}
              key={bucket.id}
              type="button"
              aria-label={label}
              aria-pressed={canSelect && selectedId === bucket.id}
              aria-disabled={!canSelect}
              disabled={!hasVisibleData}
              title={label}
              onClick={() => {
                if (canSelect) {
                  onSelect(bucket.id);
                }
              }}
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
  bucket,
  aggregateOnly = false
}: {
  title: string;
  bucket: UsageBucket;
  aggregateOnly?: boolean;
}): React.JSX.Element {
  return (
    <div className="terminal-selected-breakdown">
      <h2 className="terminal-title">{title}</h2>
      <p>Total browsing: {formatHistoryDuration(bucket.totalMs)}</p>
      {aggregateOnly ? (
        <p className="terminal-muted">Aggregate only. Private site details are hidden.</p>
      ) : (
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
      )}
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
  const [historyMode, setHistoryMode] = useState<HistoryModeSelection>(DEFAULT_HISTORY_MODE);
  const now = Date.now();
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - DAY_MS;
  const currentWeekStart = startOfLocalWeek(now);
  const displayedWeekStart = currentWeekStart + weekOffset * WEEK_MS;
  const displayedWeekEnd = displayedWeekStart + WEEK_MS;
  const historyWindowScope = historyModeToScope(historyMode);
  const historyUsageMode = historyModeToUsageMode(historyMode);
  const canShowDomainBreakdown = canDrillIntoHistoryMode(historyMode);
  const emptyState = historyModeEmptyState(historyMode);
  const hasHistoryData = sessions.length > 0;

  useEffect(() => {
    let mounted = true;
    setSelectedBucketId(null);
    const historyRequest =
      range === "last-7-days"
        ? sendMessage<HistorySessionView[]>({
            type: "GET_HISTORY_INTERVAL",
            startedAt: displayedWeekStart,
            endedAt: displayedWeekEnd,
            windowScope: historyWindowScope,
            usageMode: historyUsageMode
          })
        : sendMessage<HistorySessionView[]>({
            type: "GET_HISTORY",
            range,
            windowScope: historyWindowScope,
            usageMode: historyUsageMode
          });

    historyRequest
      .then(async (next) => {
        if (range === "last-7-days") {
          const previousStart = displayedWeekStart - WEEK_MS;
          const previous = await sendMessage<HistorySessionView[]>({
            type: "GET_HISTORY_INTERVAL",
            startedAt: previousStart,
            endedAt: displayedWeekStart,
            windowScope: historyWindowScope,
            usageMode: historyUsageMode
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
  }, [displayedWeekEnd, displayedWeekStart, historyUsageMode, historyWindowScope, range]);

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

  function setHistoryModeButton(button: HistoryModeButton): void {
    setHistoryMode((current) => toggleHistoryMode(current, button));
  }

  return (
    <section className="terminal-section">
      <div className="terminal-history-heading">
        <h1 className="terminal-title">History</h1>
        <div className="terminal-history-mode-buttons" aria-label="History mode">
          <HistoryModeToggle
            button="private"
            active={historyMode.private}
            onClick={() => setHistoryModeButton("private")}
          />
          <HistoryModeToggle
            button="pip"
            active={historyMode.mediaMode === "pip"}
            onClick={() => setHistoryModeButton("pip")}
          />
          <HistoryModeToggle
            button="background"
            active={historyMode.mediaMode === "background"}
            onClick={() => setHistoryModeButton("background")}
          />
        </div>
      </div>
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
                  className="terminal-button terminal-week-button"
                  type="button"
                  disabled={!hasPreviousWeekData}
                  onClick={() => setWeekOffset((offset) => offset - 1)}
                >
                  &lt;
                </button>
                <span>{weekLabel}</span>
                <button
                  className="terminal-button terminal-week-button"
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
              <div
                className="terminal-history-panel"
                onPointerDown={() => setSelectedBucketId(null)}
              >
                <DomainBreakdown
                  title={fullDateFormatter.format(new Date(selectedDailyBucket.start))}
                  bucket={selectedDailyBucket}
                  aggregateOnly={!canShowDomainBreakdown}
                />
              </div>
            ) : (
              <p className="terminal-muted">
                {canShowDomainBreakdown
                  ? "Select a day to see site totals."
                  : hasHistoryData
                    ? "Select a day to see aggregate total."
                    : emptyState}
              </p>
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
              <div
                className="terminal-history-panel"
                onPointerDown={() => setSelectedBucketId(null)}
              >
                <DomainBreakdown
                  title={selectedHourlyBucket.label}
                  bucket={selectedHourlyBucket}
                  aggregateOnly={!canShowDomainBreakdown}
                />
              </div>
            ) : panelMode === "today-sessions" ? (
              <div className="terminal-list" style={{ marginTop: "2rem" }}>
                {!canShowDomainBreakdown ? (
                  <p className="terminal-muted">
                    {hasHistoryData ? "Select an hour to see aggregate total." : emptyState}
                  </p>
                ) : sessions.length > 0 ? (
                  sessions.map((session) => (
                    <div className="terminal-list-row" key={session.id}>
                      <span>
                        {formatClockRange(session.startedAt, session.endedAt)} {session.domain}
                      </span>
                      <span>{formatHistoryDuration(session.durationMs)}</span>
                    </div>
                  ))
                ) : (
                  <p className="terminal-muted">{emptyState}</p>
                )}
              </div>
            ) : (
              <p className="terminal-muted">
                {canShowDomainBreakdown
                  ? "Select an hour to see site totals."
                  : hasHistoryData
                    ? "Select an hour to see aggregate total."
                    : emptyState}
              </p>
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
  const [windowScopeView, setWindowScopeView] = useState<WindowScope>("regular");
  const visibleBlockedDomains = useMemo(
    () =>
      (settings?.blockedDomains ?? []).filter(
        (blocked) => normalizeWindowScope(blocked.windowScope) === windowScopeView
      ),
    [settings?.blockedDomains, windowScopeView]
  );

  async function blockDomain(): Promise<void> {
    try {
      const next = await sendMessage<ExtensionSettings>({
        type: "ADD_BLOCKED_DOMAIN",
        input,
        schedule,
        windowScope: windowScopeView
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
        schedule: editingSchedule,
        windowScope: windowScopeView
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
      <div className="terminal-page-heading">
        <div>
          <h1 className="terminal-title">Blocked Sites</h1>
        </div>
        <PrivateScopeToggle
          activeScope={windowScopeView}
          onToggle={() =>
            setWindowScopeView((current) => (current === "regular" ? "private" : "regular"))
          }
        />
      </div>
      <div className="terminal-input-row">
        <input
          aria-label="Website domain"
          placeholder={
            windowScopeView === "private" ? "Enter private-window website..." : "Enter website..."
          }
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
        {visibleBlockedDomains.length ? (
          visibleBlockedDomains.map((blocked) => (
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
  const [windowScopeView, setWindowScopeView] = useState<WindowScope>("regular");
  const placeholder = useCyclingTypedPlaceholder(input, windowScopeView === "private");
  const selectedTimeLimitOptions =
    windowScopeView === "private" ? privateTimeLimitOptions : timeLimitOptions;
  const visibleTimeLimits = useMemo(
    () =>
      (settings?.timeLimitedDomains ?? []).filter(
        (limited) => normalizeWindowScope(limited.windowScope) === windowScopeView
      ),
    [settings?.timeLimitedDomains, windowScopeView]
  );

  useEffect(() => {
    if (windowScopeView === "regular" && limitMinutes === 0) {
      setLimitMinutes(1);
    }

    if (windowScopeView === "regular" && editingLimitMinutes === 0) {
      setEditingLimitMinutes(1);
    }
  }, [editingLimitMinutes, limitMinutes, windowScopeView]);

  async function addLimit(): Promise<void> {
    try {
      const next = await sendMessage<ExtensionSettings>({
        type: "ADD_TIME_LIMITED_DOMAIN",
        input,
        limitMinutes,
        schedule,
        windowScope: windowScopeView
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
      schedule: nextSchedule,
      windowScope: windowScopeView
    });
    onSettingsChanged(next);
  }

  function startEditing(limited: TimeLimitedDomain): void {
    if (editingId === limited.id) {
      setEditingId(null);
      return;
    }

    setEditingId(limited.id);
    setEditingInput(limited.domain ?? "");
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
      <div className="terminal-page-heading">
        <div>
          <h1 className="terminal-title">Time Limits</h1>
        </div>
        <PrivateScopeToggle
          activeScope={windowScopeView}
          onToggle={() =>
            setWindowScopeView((current) => (current === "regular" ? "private" : "regular"))
          }
        />
      </div>
      <div className="terminal-input-row terminal-input-row-three">
        <input
          aria-label="Website domain"
          placeholder={placeholder}
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
          options={selectedTimeLimitOptions}
          onChange={setLimitMinutes}
        />
        <button className="terminal-button" type="button" onClick={() => void addLimit()}>
          Limit
        </button>
      </div>
      <ScheduleEditor schedule={schedule} onChange={setSchedule} />

      {error ? <p className="terminal-error">{error}</p> : null}

      <div className="terminal-list" style={{ marginTop: "2rem" }}>
        {visibleTimeLimits.length ? (
          visibleTimeLimits.map((limited) => (
            <div className="terminal-rule" key={limited.id}>
              <div className="terminal-list-row">
                <span className="terminal-rule-copy">
                  <span>{timeLimitDisplayName(limited)}</span>
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
                      aria-label={`Edit time limit target ${timeLimitDisplayName(limited)}`}
                      placeholder={
                        windowScopeView === "private"
                          ? "Leave blank for All Private Browsing"
                          : "Leave blank for All Browsing"
                      }
                      value={editingInput}
                      onChange={(event) => setEditingInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void saveEdit(limited.id);
                        }
                      }}
                    />
                    <TerminalSelect
                      ariaLabel={`Daily limit for ${timeLimitDisplayName(limited)}`}
                      value={editingLimitMinutes}
                      options={selectedTimeLimitOptions}
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

function PathwaySummaryRow({
  pathway,
  metric
}: {
  pathway: PathwaySummary;
  metric: string;
}): React.JSX.Element {
  const label =
    pathway.displayLabel ?? pathway.displaySegments?.join(" -> ") ?? pathway.domains.join(" -> ");
  const details = pathway.details ?? [
    { label: "raw domains", value: (pathway.rawDomains ?? pathway.domains).join(" -> ") },
    { label: "repeat count", value: `${pathway.count}x` }
  ];

  return (
    <details className="terminal-pathway-details">
      <summary className="terminal-list-row">
        <span>{label}</span>
        <span>{metric}</span>
      </summary>
      <div className="terminal-grid terminal-pathway-metadata">
        {details.map((row) => (
          <React.Fragment key={`${pathway.id}:${row.label}`}>
            <span>{row.label}</span>
            <span>{row.value}</span>
          </React.Fragment>
        ))}
      </div>
    </details>
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
              className="terminal-button terminal-action-invert"
              type="button"
              onClick={() => onApply(recommendation.id)}
            >
              Apply
            </button>
          ) : null}
          <button
            className="terminal-button terminal-action-invert"
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
                <PathwaySummaryRow
                  key={pathway.id}
                  pathway={pathway}
                  metric={`${pathway.count}x`}
                />
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
                <PathwaySummaryRow
                  key={pathway.id}
                  pathway={pathway}
                  metric={formatHistoryDuration(pathway.averageDiversionMs)}
                />
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

interface ConfirmationState {
  title: string;
  message: string;
  confirmLabel: string;
  confirmationText?: string;
  inputLabel?: string;
  run?: (confirmationText: string) => Promise<void>;
  actions?: Array<{
    label: string;
    run: () => Promise<void>;
  }>;
}

function privateAccessInstructions(): string {
  switch (getBrowserTarget()) {
    case "firefox":
      return "Firefox controls this outside 0wl. Open Add-ons and Themes, choose 0wl, then set Run in Private Windows to Allow.";
    case "chrome":
      return "Chrome controls this outside 0wl. Open Extensions, choose 0wl details, then enable Allow in incognito.";
    case "edge":
      return "Edge controls this outside 0wl. Open Extensions, choose 0wl details, then enable Allow in InPrivate.";
    case "opera":
      return "Opera controls this outside 0wl. Open Extensions, choose 0wl details, then enable Allow in private mode.";
    case "safari":
      return "Safari controls this outside 0wl. Open Safari extension settings and allow 0wl in private browsing if your Safari version supports it.";
    case "unknown":
      return "Your browser controls this outside 0wl. Open the browser extension settings for 0wl and allow private/incognito access.";
  }
}

function ConfirmationDialog({
  state,
  resetText,
  onResetTextChange,
  onCancel,
  onConfirm,
  onAction
}: {
  state: ConfirmationState;
  resetText: string;
  onResetTextChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onAction?: (action: NonNullable<ConfirmationState["actions"]>[number]) => void;
}): React.JSX.Element {
  const requiredText = state.confirmationText;
  const disabled = requiredText !== undefined && resetText.toLowerCase() !== requiredText;

  return (
    <div className="terminal-modal-overlay" role="presentation" onPointerDown={onCancel}>
      <section
        className="terminal-modal terminal-help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="terminal-help-header">
          <h2 className="terminal-title" id="confirm-title">
            {state.title}
          </h2>
          <button
            className="terminal-help-close"
            type="button"
            aria-label="Close confirmation"
            onClick={onCancel}
          >
            [x]
          </button>
        </div>
        <p>{state.message}</p>
        {requiredText ? (
          <input
            aria-label={state.inputLabel ?? "Confirmation text"}
            placeholder={requiredText}
            value={resetText}
            onChange={(event) => onResetTextChange(event.target.value)}
          />
        ) : null}
        <div className="terminal-actions">
          <button
            className="terminal-button terminal-action-invert"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          {state.actions ? (
            state.actions.map((action) => (
              <button
                className="terminal-button terminal-action-invert"
                key={action.label}
                type="button"
                onClick={() => onAction?.(action)}
              >
                {action.label}
              </button>
            ))
          ) : (
            <button
              className="terminal-button terminal-action-invert"
              type="button"
              disabled={disabled}
              onClick={onConfirm}
            >
              {state.confirmLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function DataControlSection({
  settings,
  onSettingsChanged
}: {
  settings: ExtensionSettings | null;
  onSettingsChanged: (settings: ExtensionSettings) => void;
}): React.JSX.Element {
  const [status, setStatus] = useState<DataControlStatus | null>(null);
  const [importMode, setImportMode] = useState<DataImportMode>("merge");
  const [deleteTarget, setDeleteTarget] =
    useState<Exclude<DataDeleteTarget, "settings">>("browsing-history");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [resetText, setResetText] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshDataControl = useCallback(async (): Promise<void> => {
    const [nextStatus, nextSettings] = await Promise.all([
      sendMessage<DataControlStatus>({ type: "GET_DATA_CONTROL_STATUS" }),
      sendMessage<ExtensionSettings>({ type: "GET_SETTINGS" })
    ]);
    setStatus(nextStatus);
    onSettingsChanged(nextSettings);
  }, [onSettingsChanged]);

  useEffect(() => {
    refreshDataControl().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load local data.");
    });
  }, [refreshDataControl]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function runDataAction(action: () => Promise<void>, success: string): Promise<void> {
    try {
      setNotice(null);
      await action();
      await refreshDataControl();
      setNotice(success);
      setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Data action failed.");
    }
  }

  async function exportAllData(): Promise<void> {
    await runDataAction(async () => {
      downloadBackup(await sendMessage<DataExportResult>({ type: "EXPORT_ALL_DATA" }));
    }, "Export prepared.");
  }

  async function importBackup(backup: DataBackup, mode: DataImportMode): Promise<void> {
    await runDataAction(
      async () => {
        await sendMessage<DataControlStatus>({
          type: "IMPORT_DATA_BACKUP",
          backup,
          mode
        });
      },
      mode === "replace" ? "Backup imported and replaced local data." : "Backup imported."
    );
  }

  async function readBackupFile(file: File): Promise<DataBackup> {
    return JSON.parse(await file.text()) as DataBackup;
  }

  async function handleImportFile(file: File): Promise<void> {
    try {
      const backup = await readBackupFile(file);

      if (importMode === "replace") {
        setResetText("");
        setConfirmation({
          title: "Replace local data",
          message:
            "This replaces current 0wl data with the selected backup. Export first if you need a copy.",
          confirmLabel: "Import Backup",
          confirmationText: "confirm",
          inputLabel: "Type confirm to import backup",
          run: () => importBackup(backup, "replace")
        });
        return;
      }

      await importBackup(backup, "merge");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import backup.");
    }
  }

  function requestDelete(target: DataDeleteTarget, label: string): void {
    setResetText("");
    setConfirmation({
      title: label,
      message: `${label} affects only local data in this browser. Type confirm to continue.`,
      confirmLabel: label,
      confirmationText: "confirm",
      inputLabel: `Type confirm to ${label.toLowerCase()}`,
      run: async () => {
        await runDataAction(async () => {
          await sendMessage<DataControlStatus>({ type: "DELETE_LOCAL_DATA", target });
        }, `${label} complete.`);
      }
    });
  }

  function requestResetAll(): void {
    setResetText("");
    setConfirmation({
      title: "Reset All Local Data",
      message:
        "This permanently deletes all 0wl data stored in this browser. Type confirm to continue.",
      confirmLabel: "Reset All Local Data",
      confirmationText: "confirm",
      inputLabel: "Type confirm to reset all local data",
      run: async () => {
        await runDataAction(async () => {
          await sendMessage<DataControlStatus>({
            type: "RESET_ALL_LOCAL_DATA",
            confirmation: "RESET 0WL"
          });
        }, "All local data reset.");
      }
    });
  }

  function requestDangerExport(): void {
    setResetText("");
    setConfirmation({
      title: "Export Data First",
      message:
        "This prepares a local JSON backup before destructive actions. Type confirm to continue.",
      confirmLabel: "Export Data First",
      confirmationText: "confirm",
      inputLabel: "Type confirm to export data first",
      run: async () => {
        await exportAllData();
      }
    });
  }

  function requestRetentionChange(value: string): void {
    const historyRetentionDays = selectValueToRetention(value);
    const label =
      retentionOptions.find((option) => option.value === value)?.label ?? "the selected window";

    if (historyRetentionDays === null) {
      void runDataAction(async () => {
        await sendMessage<DataControlStatus>({
          type: "SET_HISTORY_RETENTION",
          historyRetentionDays
        });
      }, "History retention updated.");
      return;
    }

    setResetText("");
    setConfirmation({
      title: "Update History Retention",
      message: `This keeps local history for ${label} and removes older local history records. Export first if you need a backup.`,
      confirmLabel: "Save Retention",
      confirmationText: "confirm",
      inputLabel: "Type confirm to update retention",
      run: async () => {
        await runDataAction(async () => {
          await sendMessage<DataControlStatus>({
            type: "SET_HISTORY_RETENTION",
            historyRetentionDays
          });
        }, "History retention updated.");
      }
    });
  }

  function closeConfirmation(): void {
    setConfirmation(null);
    setResetText("");
  }

  async function confirmAction(): Promise<void> {
    if (!confirmation) {
      return;
    }

    await confirmation.run?.(resetText);
    closeConfirmation();
  }

  return (
    <section className="terminal-data-control" aria-labelledby="data-control-title">
      <h2 className="terminal-subheading" id="data-control-title">
        Data Control
      </h2>

      <div className="terminal-data-grid">
        <section className="terminal-subsection">
          <h3>Local Data Status</h3>
          <div className="terminal-list">
            <div className="terminal-list-row">
              <span>Storage used</span>
              <span>{status ? formatBytes(status.storageUsedBytes) : "loading"}</span>
            </div>
            <div className="terminal-list-row">
              <span>Oldest record</span>
              <span>{status ? formatRecordDate(status.oldestRecordAt) : "loading"}</span>
            </div>
            <div className="terminal-list-row">
              <span>Sessions</span>
              <span>{status?.sessions ?? "loading"}</span>
            </div>
            <div className="terminal-list-row">
              <span>Daily usage records</span>
              <span>{status?.dailyUsageRecords ?? "loading"}</span>
            </div>
            <div className="terminal-list-row">
              <span>Blocked attempts</span>
              <span>{status?.blockedAttempts ?? "loading"}</span>
            </div>
            <div className="terminal-list-row">
              <span>Vision events</span>
              <span>{status?.visionEvents ?? "loading"}</span>
            </div>
            <div className="terminal-list-row">
              <span>Site categories</span>
              <span>
                {status
                  ? `${status.seedSiteCategories} seed / ${status.customSiteCategories} custom`
                  : "loading"}
              </span>
            </div>
            <div className="terminal-list-row">
              <span></span>
              <a className="terminal-button terminal-action-invert" href={APP_PRIVACY_POLICY_URL}>
                Privacy Policy
              </a>
            </div>
          </div>
        </section>

        <section className="terminal-subsection terminal-separated">
          <h3>Backup</h3>
          <p className="terminal-muted">Download or restore a local backup of your 0wl data.</p>
          <div className="terminal-actions">
            <button
              className="terminal-button terminal-action-invert"
              type="button"
              onClick={() => void exportAllData()}
            >
              Export All Data
            </button>
            <button
              className="terminal-button terminal-action-invert"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Import Backup
            </button>
          </div>
          <div className="terminal-list-row">
            <span>Import mode</span>
            <TerminalSelect
              ariaLabel="Import mode"
              value={importMode}
              options={[
                { label: "Merge with existing data", value: "merge" },
                { label: "Replace existing data", value: "replace" }
              ]}
              onChange={setImportMode}
              width="min(100%, 18rem)"
            />
          </div>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";

              if (file) {
                void handleImportFile(file);
              }
            }}
          />
        </section>

        <section className="terminal-subsection terminal-separated">
          <h3>History Retention</h3>
          <div className="terminal-list-row">
            <span>Keep history for</span>
            <TerminalSelect
              ariaLabel="History retention"
              value={retentionToSelectValue(settings?.historyRetentionDays ?? null)}
              options={retentionOptions}
              onChange={requestRetentionChange}
              width="min(100%, 13rem)"
            />
          </div>
        </section>

        <section className="terminal-subsection terminal-separated">
          <h3>Delete Specific Data</h3>
          <div className="terminal-input-row">
            <TerminalSelect
              ariaLabel="Data to clear"
              value={deleteTarget}
              options={deleteSpecificOptions}
              onChange={setDeleteTarget}
              width="min(100%, 22rem)"
            />
            <button
              className="terminal-button terminal-action-invert"
              type="button"
              onClick={() => {
                const selected = deleteSpecificOptions.find(
                  (option) => option.value === deleteTarget
                );
                requestDelete(deleteTarget, selected?.label ?? "Clear Selected Data");
              }}
            >
              Confirm
            </button>
          </div>
        </section>

        <section className="terminal-subsection terminal-danger-zone">
          <h3>Danger Zone</h3>
          <p>This permanently deletes all 0wl data stored in this browser.</p>
          <div className="terminal-actions">
            <button
              className="terminal-button terminal-action-invert"
              type="button"
              onClick={requestDangerExport}
            >
              Export Data First
            </button>
            <button
              className="terminal-button terminal-action-invert"
              type="button"
              onClick={requestResetAll}
            >
              Reset All Local Data
            </button>
          </div>
        </section>
      </div>

      {notice ? <p className="terminal-muted">{notice}</p> : null}
      {error ? <p className="terminal-error">{error}</p> : null}

      {confirmation ? (
        <ConfirmationDialog
          state={confirmation}
          resetText={resetText}
          onResetTextChange={setResetText}
          onCancel={closeConfirmation}
          onConfirm={() => void confirmAction()}
        />
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
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [resetText, setResetText] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  async function updateSettings(changes: SettingsChanges): Promise<void> {
    const next = await sendMessage<ExtensionSettings>({
      type: "UPDATE_SETTINGS",
      changes
    });
    onSettingsChanged(next);
  }

  function closeConfirmation(): void {
    setConfirmation(null);
    setResetText("");
  }

  async function requestResetSettings(): Promise<void> {
    setResetText("");
    setConfirmation({
      title: "Reset Settings",
      message: "This resets only 0wl settings in this browser. Type confirm to continue.",
      confirmLabel: "Reset Settings",
      confirmationText: "confirm",
      inputLabel: "Type confirm to reset settings",
      run: async () => {
        await sendMessage<DataControlStatus>({
          type: "DELETE_LOCAL_DATA",
          target: "settings"
        });
        onSettingsChanged(await sendMessage<ExtensionSettings>({ type: "GET_SETTINGS" }));
        setSettingsNotice("Settings reset.");
      }
    });
  }

  async function requestEnablePrivateTracking(): Promise<void> {
    setResetText("");
    setSettingsNotice(null);
    setSettingsError(null);

    const accessStatus = await getPrivateWindowAccessStatus();

    if (accessStatus === "not-allowed") {
      setConfirmation({
        title: "Private browser access needed",
        message: `${privateAccessInstructions()} Browser extensions do not provide a native permission prompt that 0wl can open from this toggle. After allowing access in the browser, return here and enable this setting again.`,
        confirmLabel: "Got It"
      });
      return;
    }

    setConfirmation({
      title: "Enable private browsing tracking?",
      message:
        accessStatus === "allowed"
          ? "Your browser reports that 0wl can access private/incognito windows. Enable private browsing tracking and enforcement?"
          : "0wl could not verify private/incognito access in this browser. Enable the 0wl setting only if you have also allowed private/incognito access in the browser extension settings.",
      confirmLabel: "Enable",
      run: async () => {
        await updateSettings({ privateBrowserTrackingEnabled: true });
        setSettingsNotice(
          accessStatus === "allowed"
            ? "Private browsing tracking enabled."
            : "Private browsing tracking enabled. Browser access could not be verified."
        );
      }
    });
  }

  function requestDisablePrivateTracking(): void {
    setResetText("");
    setConfirmation({
      title: "Disable private browsing tracking?",
      message:
        "0wl will stop tracking and enforcing private/incognito browsing rules where your browser permits it. Do you want to delete private browsing data stored by 0wl?",
      confirmLabel: "Disable",
      actions: [
        {
          label: "Disable and keep private data",
          run: async () => {
            await updateSettings({ privateBrowserTrackingEnabled: false });
            setSettingsNotice("Private browsing tracking disabled. Private data kept.");
          }
        },
        {
          label: "Disable and delete private data",
          run: async () => {
            await sendMessage<DataControlStatus>({ type: "CLEAR_PRIVATE_BROWSING_DATA" });
            onSettingsChanged(await sendMessage<ExtensionSettings>({ type: "GET_SETTINGS" }));
            setSettingsNotice("Private browsing tracking disabled. Private browsing data deleted.");
          }
        }
      ]
    });
  }

  useEffect(() => {
    if (!settingsNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSettingsNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [settingsNotice]);

  async function confirmSettingsAction(): Promise<void> {
    if (!confirmation) {
      return;
    }

    try {
      setSettingsNotice(null);
      await confirmation.run?.(resetText);
      setSettingsError(null);
      closeConfirmation();
    } catch (resetError) {
      setSettingsError(
        resetError instanceof Error ? resetError.message : "Unable to reset settings."
      );
    }
  }

  async function runSettingsConfirmationAction(
    action: NonNullable<ConfirmationState["actions"]>[number]
  ): Promise<void> {
    try {
      setSettingsNotice(null);
      await action.run();
      setSettingsError(null);
      closeConfirmation();
    } catch (actionError) {
      setSettingsError(
        actionError instanceof Error ? actionError.message : "Unable to update settings."
      );
    }
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

        <label className="terminal-list-row">
          <span>Private browsing tracking enabled</span>
          <TerminalCheckbox
            checked={settings?.privateBrowserTrackingEnabled ?? false}
            onChange={(checked) =>
              checked ? void requestEnablePrivateTracking() : requestDisablePrivateTracking()
            }
          />
        </label>
        <div className="terminal-list-row">
          <span>
            see our [
            <a className="terminal-link" href={APP_PRIVACY_POLICY_URL}>
              privacy policy
            </a>
            ] for what's tracked
          </span>
          <span></span>
        </div>

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

        <div className="terminal-list-row">
          <span>Reset settings only</span>
          <button
            className="terminal-button terminal-action-invert"
            type="button"
            onClick={() => void requestResetSettings()}
          >
            Reset Settings
          </button>
        </div>
      </div>
      {settingsError ? <p className="terminal-error">{settingsError}</p> : null}
      {settingsNotice ? <p className="terminal-muted">{settingsNotice}</p> : null}
      <DataControlSection settings={settings} onSettingsChanged={onSettingsChanged} />
      {confirmation ? (
        <ConfirmationDialog
          state={confirmation}
          resetText={resetText}
          onResetTextChange={setResetText}
          onCancel={closeConfirmation}
          onConfirm={() => void confirmSettingsAction()}
          onAction={(action) => void runSettingsConfirmationAction(action)}
        />
      ) : null}
    </section>
  );
}

function Dashboard(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(() => readInitialTab());
  const [brandMode, setBrandMode] = useState<"text" | "icon">(() => readInitialBrandMode());
  const [brandHoverPaused, setBrandHoverPaused] = useState(false);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectTab = useCallback((nextTab: Tab): void => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(null, "", url);
  }, []);

  const toggleBrandMode = useCallback((): void => {
    const next = brandMode === "text" ? "icon" : "text";
    setBrandMode(next);
    setBrandHoverPaused(true);
    window.localStorage.setItem(DASHBOARD_BRAND_MODE_STORAGE_KEY, next);
  }, [brandMode]);

  useEffect(() => {
    if (!brandHoverPaused) {
      return undefined;
    }

    const timer = window.setTimeout(() => setBrandHoverPaused(false), 1500);
    return () => window.clearTimeout(timer);
  }, [brandHoverPaused]);

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

  const textBrand = <span className="terminal-brand-option terminal-brand-text">[0wl]</span>;
  const iconBrand = (
    <span className="terminal-brand-option terminal-brand-icon">
      <img src={browser.runtime.getURL("/icons/w0wltb-32.png")} alt="0wl" />
    </span>
  );

  return (
    <main className="terminal-shell">
      <div className="terminal-frame">
        <header className="terminal-header">
          <button
            className={`terminal-brand-toggle ${brandHoverPaused ? "paused" : ""}`}
            type="button"
            aria-label="Toggle 0wl title"
            onClick={toggleBrandMode}
          >
            {brandMode === "text" ? textBrand : iconBrand}
            <span className="terminal-brand-hover" aria-hidden="true">
              {brandMode === "text" ? iconBrand : textBrand}
            </span>
          </button>
          <nav className="terminal-tabs terminal-dashboard-tabs" aria-label="Dashboard sections">
            {(["today", "history", "blocked", "limits", "vision", "settings"] as const).map(
              (option) => (
                <button
                  className={`terminal-button ${tab === option ? "active" : ""}`}
                  key={option}
                  type="button"
                  aria-label={option === "settings" ? "settings" : undefined}
                  title={option === "settings" ? "settings" : undefined}
                  onClick={() => selectTab(option)}
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
      {tab === "settings" ? <ExtensionFooter onTodayClick={() => selectTab("today")} /> : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Dashboard />);
