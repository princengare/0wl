import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { sendMessage } from "@/shared/messagingClient";
import { formatDuration } from "@/shared/time";
import type { TodaySummary } from "@/shared/types";
import "@/styles/terminal.css";

function Popup(): React.JSX.Element {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load(): Promise<void> {
      try {
        const next = await sendMessage<TodaySummary>({ type: "GET_TODAY_SUMMARY" });
        if (mounted) {
          setSummary(next);
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

  const topDomains = summary?.domains.slice(0, 3) ?? [];

  return (
    <main className="terminal-popup">
      <section className="terminal-frame">
        <div className="terminal-section">
          <h1 className="terminal-title">Today</h1>
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
