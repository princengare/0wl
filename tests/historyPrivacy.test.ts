import { describe, expect, it } from "vitest";
import { toHistorySessionView } from "@/shared/historyPrivacy";
import type { UsageSession } from "@/shared/types";

const session: UsageSession = {
  id: "private-session",
  domain: "secret.example",
  windowScope: "private",
  startedAt: 1,
  endedAt: 61_000,
  durationMs: 60_000,
  startReason: "startup",
  endReason: "navigation",
  dateKey: "1970-01-01",
  createdAt: 61_000
};

describe("private history redaction", () => {
  it("redacts private active browsing domains into an aggregate label", () => {
    expect(toHistorySessionView(session, "private", "active")).toMatchObject({
      domain: "Private browsing",
      aggregateOnly: true,
      windowScope: "private"
    });
  });

  it("redacts private media modes into aggregate labels", () => {
    expect(toHistorySessionView(session, "private", "pip").domain).toBe(
      "Private Picture-in-Picture"
    );
    expect(toHistorySessionView(session, "private", "background").domain).toBe(
      "Private background media"
    );
  });

  it("keeps regular domains visible for normal drill-down", () => {
    expect(toHistorySessionView(session, "regular", "active")).toMatchObject({
      domain: "secret.example",
      aggregateOnly: false,
      windowScope: "regular"
    });
  });
});
