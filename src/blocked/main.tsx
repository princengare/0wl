import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { tryNormalizeDomain } from "@/shared/domain";
import { sendMessage } from "@/shared/messagingClient";
import type { ExtensionSettings } from "@/shared/types";
import "@/styles/terminal.css";

function BlockedPage(): React.JSX.Element {
  const [domain, setDomain] = useState<string>("blocked site");
  const [attemptCount, setAttemptCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const queryDomain = new URLSearchParams(window.location.search).get("domain") ?? "";
    const normalizedDomain = tryNormalizeDomain(queryDomain);

    if (normalizedDomain && mounted) {
      setDomain(normalizedDomain);
    }

    async function record(): Promise<void> {
      if (!normalizedDomain) {
        return;
      }

      try {
        await sendMessage({ type: "RECORD_BLOCK_ATTEMPT", domain: normalizedDomain });
        const settings = await sendMessage<ExtensionSettings>({ type: "GET_SETTINGS" });

        if (!settings.showBlockedAttemptCount) {
          return;
        }

        const count = await sendMessage<number>({
          type: "GET_BLOCKED_ATTEMPT_COUNT",
          domain: normalizedDomain
        });

        if (mounted) {
          setAttemptCount(count);
        }
      } catch {
        if (mounted) {
          setAttemptCount(null);
        }
      }
    }

    void record();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="terminal-centered">
      <section className="terminal-frame">
        <div className="terminal-blocked-body">
          <h1 className="terminal-title">SITE BLOCKED</h1>
          <p>{domain}</p>
          <p>You chose to block this website.</p>
          <button className="terminal-button" type="button" onClick={() => window.history.back()}>
            Go Back
          </button>
          {attemptCount === null ? null : <p>Blocked {attemptCount} times today</p>}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<BlockedPage />);
