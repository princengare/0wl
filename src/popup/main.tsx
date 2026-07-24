import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "@/shared/browser";
import { sendMessage } from "@/shared/messagingClient";
import { formatDuration } from "@/shared/time";
import type { ScheduledBreakStatus, TodaySummary, WindowScope } from "@/shared/types";
import "@/styles/terminal.css";

interface ScopedBreakStatus extends ScheduledBreakStatus {
  windowScope: WindowScope;
}

function Popup(): React.JSX.Element {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [breakStatus, setBreakStatus] = useState<ScopedBreakStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load(): Promise<void> {
      try {
        const [next, regularBreak, privateBreak] = await Promise.all([
          sendMessage<TodaySummary>({ type: "GET_TODAY_SUMMARY" }),
          sendMessage<ScheduledBreakStatus>({
            type: "GET_SCHEDULED_BREAK_STATUS",
            windowScope: "regular"
          }),
          sendMessage<ScheduledBreakStatus>({
            type: "GET_SCHEDULED_BREAK_STATUS",
            windowScope: "private"
          })
        ]);
        if (mounted) {
          setSummary(next);
          setBreakStatus(
            privateBreak.visible
              ? { ...privateBreak, windowScope: "private" }
              : regularBreak.visible
                ? { ...regularBreak, windowScope: "regular" }
                : null
          );
          setError(null);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load usage.");
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 1000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  function openDashboard(): void {
    browser.runtime.openOptionsPage();
  }

  async function toggleDnd(): Promise<void> {
    if (!breakStatus) {
      return;
    }

    const next = await sendMessage<ScheduledBreakStatus>({
      type: "SET_SCHEDULED_BREAK_DND",
      enabled: !breakStatus.dndEnabled,
      windowScope: breakStatus.windowScope
    });
    setBreakStatus({ ...next, windowScope: breakStatus.windowScope });
  }

  const topDomains = summary?.domains.slice(0, 3) ?? [];

  return (
    <main className="terminal-popup">
      <section className="terminal-frame">
        <div className="terminal-section">
          <div className="terminal-popup-heading-row">
            <h1 className="terminal-title">Today</h1>
            {breakStatus?.visible ? (
              <button
                className={`terminal-private-toggle terminal-popup-dnd ${
                  breakStatus.dndEnabled ? "active" : ""
                }`}
                type="button"
                aria-label={
                  breakStatus.dndEnabled ? "Scheduled breaks paused" : "Pause scheduled breaks"
                }
                aria-pressed={breakStatus.dndEnabled}
                title={breakStatus.dndEnabled ? "Scheduled breaks paused" : "Pause breaks"}
                onClick={() => void toggleDnd()}
              >
                <svg aria-hidden="true" viewBox="0 0 32 32" focusable="false" role="img">
                  <path d="M21.5 5.5A11 11 0 1 0 26.5 22 9 9 0 0 1 21.5 5.5Z" />
                </svg>
              </button>
            ) : null}
          </div>
          <p className="terminal-kpi">{formatDuration(summary?.totalDurationMs ?? 0)}</p>
        </div>

        <div className="terminal-section">
          <div className="terminal-grid">
            <span>Currently</span>
            <span />
            <span>{summary?.currentDomain ?? "inactive"}</span>
            <span>{formatDuration(summary?.currentSessionElapsedMs ?? 0)}</span>
          </div>
        </div>

        <div className="terminal-section">
          <h2 className="terminal-title">Top today</h2>
          <div className="terminal-grid">
            {topDomains.length > 0 ? (
              topDomains.map((row) => (
                <React.Fragment key={row.domain}>
                  <span>{row.domain}</span>
                  <span>{formatDuration(row.durationMs)}</span>
                </React.Fragment>
              ))
            ) : (
              <span className="terminal-muted">No usage yet</span>
            )}
          </div>
        </div>

        {error ? <div className="terminal-section terminal-error">{error}</div> : null}

        <div className="terminal-section">
          <button className="terminal-button" type="button" onClick={openDashboard}>
            Open Dashboard
          </button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
