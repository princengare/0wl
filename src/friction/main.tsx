import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExtensionFooter } from "@/shared/ExtensionFooter";
import { sendMessage } from "@/shared/messagingClient";
import type { FrictionLevel } from "@/vision/types";
import "@/styles/terminal.css";

const delayByLevel: Record<FrictionLevel, number> = {
  0: 0,
  1: 5,
  2: 0,
  3: 30,
  4: Number.POSITIVE_INFINITY
};

function safeReturnUrl(value: string | null, domain: string): string {
  if (!value) {
    return `https://${domain}/`;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : `https://${domain}/`;
  } catch {
    return `https://${domain}/`;
  }
}

function FrictionPage(): React.JSX.Element {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const domain = params.get("domain") ?? "this site";
  const rawLevel = Number(params.get("level"));
  const level: FrictionLevel =
    rawLevel === 1 || rawLevel === 2 || rawLevel === 3 || rawLevel === 4 ? rawLevel : 1;
  const returnUrl = safeReturnUrl(params.get("returnUrl"), domain);
  const [remaining, setRemaining] = useState(delayByLevel[level]);
  const [intent, setIntent] = useState("");

  useEffect(() => {
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [remaining]);

  async function continueToSite(nextIntent = intent || "skipped"): Promise<void> {
    await sendMessage({
      type: "RECORD_BROWSING_INTENT",
      domain,
      intent: nextIntent,
      outcome: nextIntent === "skipped" ? "skipped" : "confirmed"
    });
    window.location.assign(returnUrl);
  }

  return (
    <main className="terminal-centered">
      <section className="terminal-frame">
        <div className="terminal-blocked-body">
          <h1 className="terminal-title">
            {level === 4 ? "SITE BLOCKED" : level === 2 ? "DECLARE INTENT" : "PAUSE"}
          </h1>
          <p>{domain}</p>
          <p className="terminal-muted">
            {level === 4
              ? "This site is under a hard 0wl friction rule."
              : "This pause is local and configured inside 0wl vision."}
          </p>

          {level === 2 ? (
            <div className="terminal-list" style={{ width: "min(100%, 520px)" }}>
              {["Search for a tutorial", "Reply to someone", "Post something", "Browse"].map(
                (option) => (
                  <button
                    className="terminal-button"
                    key={option}
                    type="button"
                    onClick={() => void continueToSite(option)}
                  >
                    {option}
                  </button>
                )
              )}
              <input
                aria-label="Custom intent"
                placeholder="Other..."
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
              />
            </div>
          ) : null}

          {level === 4 ? null : remaining > 0 ? (
            <p>Continue available in {remaining} seconds</p>
          ) : (
            <button className="terminal-button" type="button" onClick={() => void continueToSite()}>
              Continue
            </button>
          )}

          <button className="terminal-button" type="button" onClick={() => window.history.back()}>
            Go Back
          </button>
        </div>
      </section>
      <ExtensionFooter />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<FrictionPage />);
