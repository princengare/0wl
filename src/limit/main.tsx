import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { tryNormalizeDomain } from "@/shared/domain";
import { ExtensionFooter } from "@/shared/ExtensionFooter";
import { sendMessage } from "@/shared/messagingClient";
import { formatDurationHuman, formatDurationMinutes } from "@/shared/time";
import { isTrackableUrl } from "@/shared/url";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { TimeLimitStatus, TimeLimitTargetType, WindowScope } from "@/shared/types";
import "@/styles/terminal.css";

function safeReturnUrl(domain: string, rawReturnUrl: string | null): string {
  if (!rawReturnUrl || !isTrackableUrl(rawReturnUrl)) {
    return `https://${domain}/`;
  }

  const returnDomain = tryNormalizeDomain(rawReturnUrl);
  return returnDomain === domain ? rawReturnUrl : `https://${domain}/`;
}

function LimitPage(): React.JSX.Element {
  const [domain, setDomain] = useState<string>("limited site");
  const [targetType, setTargetType] = useState<TimeLimitTargetType>("domain");
  const [windowScope, setWindowScope] = useState<WindowScope>("regular");
  const [status, setStatus] = useState<TimeLimitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => new URLSearchParams(window.location.search), []);

  useEffect(() => {
    let mounted = true;
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
  }, [query]);

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

  return (
    <main className="terminal-centered">
      <section className="terminal-frame">
        <div className="terminal-blocked-body">
          <h1 className="terminal-title">TIME LIMIT REACHED</h1>
          <p>{domain}</p>
          {windowScope === "private" ? <p className="terminal-muted">Private Windows</p> : null}
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
            <button className="terminal-button" type="button" onClick={() => window.history.back()}>
              Go Back
            </button>
            <button className="terminal-button" type="button" onClick={() => void continueAnyway()}>
              Continue Anyway
            </button>
          </div>
          {status?.bypassUntil ? (
            <p className="terminal-muted">
              Bypassed until {new Date(status.bypassUntil).toLocaleTimeString()}
            </p>
          ) : (
            <p className="terminal-muted">Continue Anyway bypasses this limit for 15 minutes.</p>
          )}
          {error ? <p className="terminal-error">{error}</p> : null}
        </div>
      </section>
      <ExtensionFooter />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<LimitPage />);
