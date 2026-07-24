import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { tryNormalizeDomain } from "@/shared/domain";
import { ExtensionFooter } from "@/shared/ExtensionFooter";
import { sendMessage } from "@/shared/messagingClient";
import { formatDurationHuman, formatDurationMinutes } from "@/shared/time";
import { isTrackableUrl } from "@/shared/url";
import { isAppSurfaceUrl } from "@/shared/appSurface";
import { normalizeWindowScope } from "@/platform/windowScope";
import type {
  ScheduledBreakStatus,
  TimeLimitStatus,
  TimeLimitTargetType,
  WindowScope
} from "@/shared/types";
import "@/styles/terminal.css";

function safeReturnUrl(domain: string, rawReturnUrl: string | null): string {
  if (!rawReturnUrl || !isTrackableUrl(rawReturnUrl)) {
    return `https://${domain}/`;
  }

  const returnDomain = tryNormalizeDomain(rawReturnUrl);
  return returnDomain === domain ? rawReturnUrl : `https://${domain}/`;
}

function safeBreakReturnUrl(rawReturnUrl: string | null): string | null {
  if (!rawReturnUrl || !isTrackableUrl(rawReturnUrl) || isAppSurfaceUrl(rawReturnUrl)) {
    return null;
  }

  return rawReturnUrl;
}

function LimitPage(): React.JSX.Element {
  const [domain, setDomain] = useState<string>("limited site");
  const [targetType, setTargetType] = useState<TimeLimitTargetType>("domain");
  const [windowScope, setWindowScope] = useState<WindowScope>("regular");
  const [status, setStatus] = useState<TimeLimitStatus | null>(null);
  const [breakStatus, setBreakStatus] = useState<ScheduledBreakStatus | null>(null);
  const [breakResolved, setBreakResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didResumeRef = useRef(false);
  const query = useMemo(() => new URLSearchParams(window.location.search), []);

  const resumeFromBreak = useCallback((): void => {
    if (didResumeRef.current) {
      return;
    }

    didResumeRef.current = true;
    const returnUrl = safeBreakReturnUrl(query.get("returnUrl"));

    if (returnUrl) {
      window.location.replace(returnUrl);
      return;
    }

    setBreakResolved(true);
  }, [query]);

  useEffect(() => {
    let mounted = true;
    const rawTarget = query.get("target");

    if (rawTarget === "break") {
      const nextScope = normalizeWindowScope(query.get("scope"));
      setWindowScope(nextScope);
      setDomain(nextScope === "private" ? "Private Windows" : "Browser usage");

      if (breakResolved) {
        return () => {
          mounted = false;
        };
      }

      async function loadBreakStatus(): Promise<void> {
        try {
          const next = await sendMessage<ScheduledBreakStatus>({
            type: "GET_SCHEDULED_BREAK_STATUS",
            windowScope: nextScope
          });

          if (!mounted) {
            return;
          }

          setBreakStatus(next);
          setError(null);

          if (!next.breakActive || next.remainingBreakMs <= 0) {
            resumeFromBreak();
          }
        } catch (statusError) {
          if (mounted && !breakResolved) {
            setError(
              statusError instanceof Error ? statusError.message : "Unable to load break status."
            );
          }
        }
      }

      void loadBreakStatus();
      const timer = window.setInterval(() => void loadBreakStatus(), 1000);

      return () => {
        mounted = false;
        window.clearInterval(timer);
      };
    }

    const nextTargetType = query.get("target") === "global" ? "global" : "domain";
    const nextScope = normalizeWindowScope(query.get("scope"));
    const normalizedDomain =
      nextTargetType === "global" ? null : tryNormalizeDomain(query.get("domain") ?? "");

    if (nextTargetType === "domain" && !normalizedDomain) {
      setError("Unable to verify this time limit.");
      return;
    }

    setTargetType(nextTargetType);
    setWindowScope(nextScope);
    setDomain(
      normalizedDomain ?? (nextScope === "private" ? "All Private Browsing" : "All Browsing")
    );

    sendMessage<TimeLimitStatus>({
      type: "GET_TIME_LIMIT_STATUS",
      domain: normalizedDomain ?? undefined,
      targetType: nextTargetType,
      windowScope: nextScope
    })
      .then((next) => {
        if (mounted) {
          setStatus(next);
          setError(null);
        }
      })
      .catch((statusError) => {
        if (mounted) {
          setError(
            statusError instanceof Error ? statusError.message : "Unable to load time limit."
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [breakResolved, query, resumeFromBreak]);

  async function continueAnyway(): Promise<void> {
    try {
      const next = await sendMessage<TimeLimitStatus>({
        type: "BYPASS_TIME_LIMIT",
        domain: targetType === "domain" ? domain : undefined,
        targetType,
        windowScope
      });
      setStatus(next);
      window.location.assign(
        targetType === "domain"
          ? safeReturnUrl(domain, query.get("returnUrl"))
          : isTrackableUrl(query.get("returnUrl") ?? "")
            ? (query.get("returnUrl") ?? "about:blank")
            : "about:blank"
      );
    } catch (bypassError) {
      setError(bypassError instanceof Error ? bypassError.message : "Unable to bypass time limit.");
    }
  }

  async function endBreak(): Promise<void> {
    try {
      const next = await sendMessage<ScheduledBreakStatus>({
        type: "END_SCHEDULED_BREAK",
        windowScope
      });
      setBreakStatus(next);
      setError(null);
      resumeFromBreak();
    } catch (breakError) {
      setError(breakError instanceof Error ? breakError.message : "Unable to end break.");
    }
  }

  return (
    <main className="terminal-centered">
      <section className="terminal-frame">
        <div className="terminal-blocked-body">
          <h1 className="terminal-title">
            {query.get("target") === "break"
              ? breakResolved
                ? "BREAK COMPLETE"
                : "BREAK ACTIVE"
              : "TIME LIMIT REACHED"}
          </h1>
          <p>{domain}</p>
          {windowScope === "private" ? <p className="terminal-muted">Private Windows</p> : null}
          {query.get("target") === "break" ? (
            <>
              {breakResolved ? (
                <>
                  <p>Break complete.</p>
                  <div className="terminal-actions">
                    <button
                      className="terminal-button"
                      type="button"
                      onClick={() => window.history.back()}
                    >
                      Go Back
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>0wl is pausing browsing.</p>
                  <p>
                    {breakStatus?.remainingBreakMs
                      ? `${formatDurationHuman(breakStatus.remainingBreakMs)} remaining`
                      : "Break time remaining"}
                  </p>
                  <div className="terminal-actions">
                    <button
                      className="terminal-button"
                      type="button"
                      onClick={() => window.history.back()}
                    >
                      Go Back
                    </button>
                    {breakStatus?.canEndBreak ? (
                      <button
                        className="terminal-button"
                        type="button"
                        onClick={() => void endBreak()}
                      >
                        Resume Browsing
                      </button>
                    ) : null}
                  </div>
                  {breakStatus?.canEndBreakAt && !breakStatus.canEndBreak ? (
                    <p className="terminal-muted">
                      Resume unlocks in{" "}
                      {formatDurationHuman(Math.max(0, breakStatus.canEndBreakAt - Date.now()))}
                    </p>
                  ) : (
                    <p className="terminal-muted">Longer breaks can be ended after 5 minutes.</p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p>
                You reached the daily limit for{" "}
                {targetType === "global" ? "active browsing." : "this website."}
              </p>
              {status ? (
                <p>
                  Used {formatDurationHuman(status.usedMs)} of{" "}
                  {formatDurationMinutes(status.limitMinutes)} today
                </p>
              ) : null}
              <div className="terminal-actions">
                <button
                  className="terminal-button"
                  type="button"
                  onClick={() => window.history.back()}
                >
                  Go Back
                </button>
                <button
                  className="terminal-button"
                  type="button"
                  onClick={() => void continueAnyway()}
                >
                  Continue Anyway
                </button>
              </div>
              {status?.bypassUntil ? (
                <p className="terminal-muted">
                  Bypassed until {new Date(status.bypassUntil).toLocaleTimeString()}
                </p>
              ) : (
                <p className="terminal-muted">
                  Continue Anyway bypasses this limit for 15 minutes.
                </p>
              )}
            </>
          )}
          {error ? <p className="terminal-error">{error}</p> : null}
        </div>
      </section>
      <ExtensionFooter />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<LimitPage />);
