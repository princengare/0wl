import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { sendMessage } from "@/shared/messagingClient";
import { formatClockRange, formatDuration } from "@/shared/time";
import type {
  ExtensionSettings,
  HistoryRange,
  HistorySessionView,
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

const timeLimitOptions = [
  { label: "1 minute", value: 1 },
  { label: "5 minutes", value: 5 },
  { label: "10 minutes", value: 10 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 }
] as const;

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
  const [sessions, setSessions] = useState<HistorySessionView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    sendMessage<HistorySessionView[]>({ type: "GET_HISTORY", range })
      .then((next) => {
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
  }, [range]);

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
            {option === "last-7-days" ? "Last 7 days" : option}
          </button>
        ))}
      </div>

      {error ? <p className="terminal-error">{error}</p> : null}

      <div className="terminal-list" style={{ marginTop: "2rem" }}>
        {sessions.length > 0 ? (
          sessions.map((session) => (
            <div className="terminal-list-row" key={session.id}>
              <span>
                {formatClockRange(session.startedAt, session.endedAt)} {session.domain}
              </span>
              <span>{formatDuration(session.durationMs)}</span>
            </div>
          ))
        ) : (
          <p className="terminal-muted">No sessions in this range</p>
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
  const [error, setError] = useState<string | null>(null);

  async function blockDomain(): Promise<void> {
    try {
      const next = await sendMessage<ExtensionSettings>({ type: "ADD_BLOCKED_DOMAIN", input });
      setInput("");
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

  return (
    <section className="terminal-section">
      <h1 className="terminal-title">blocked sites</h1>
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

      {error ? <p className="terminal-error">{error}</p> : null}

      <div className="terminal-list" style={{ marginTop: "2rem" }}>
        {settings?.blockedDomains.length ? (
          settings.blockedDomains.map((blocked) => (
            <div className="terminal-list-row" key={blocked.id}>
              <span>{blocked.domain}</span>
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
                  onClick={() => void removeDomain(blocked.id)}
                >
                  Remove
                </button>
              </span>
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
  const [error, setError] = useState<string | null>(null);

  async function addLimit(): Promise<void> {
    try {
      const next = await sendMessage<ExtensionSettings>({
        type: "ADD_TIME_LIMITED_DOMAIN",
        input,
        limitMinutes
      });
      setInput("");
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

  async function updateLimit(id: string, nextLimitMinutes: number): Promise<void> {
    const next = await sendMessage<ExtensionSettings>({
      type: "UPDATE_TIME_LIMITED_DOMAIN",
      id,
      limitMinutes: nextLimitMinutes
    });
    onSettingsChanged(next);
  }

  return (
    <section className="terminal-section">
      <h1 className="terminal-title">time limits</h1>
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

      {error ? <p className="terminal-error">{error}</p> : null}

      <div className="terminal-list" style={{ marginTop: "2rem" }}>
        {settings?.timeLimitedDomains.length ? (
          settings.timeLimitedDomains.map((limited) => (
            <div className="terminal-list-row" key={limited.id}>
              <span>{limited.domain}</span>
              <span className="terminal-actions">
                <select
                  aria-label={`Daily limit for ${limited.domain}`}
                  value={limited.limitMinutes}
                  onChange={(event) => void updateLimit(limited.id, Number(event.target.value))}
                >
                  {timeLimitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                  onClick={() => void removeLimit(limited.id)}
                >
                  Remove
                </button>
              </span>
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
