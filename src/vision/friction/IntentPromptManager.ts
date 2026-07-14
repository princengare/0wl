import { getDateKey } from "@/shared/time";
import { INTENT_CHECKIN_DURATION_MS } from "@/shared/constants";
import type { BrowsingIntent } from "../types";
import type { BrowsingIntentRepository } from "./BrowsingIntentRepository";

export class IntentPromptManager {
  constructor(private readonly repository: BrowsingIntentRepository) {}

  async record(
    domain: string,
    intent: string,
    outcome: BrowsingIntent["outcome"],
    now = Date.now()
  ) {
    const record: BrowsingIntent = {
      id: `${domain}-${now}`,
      domain,
      intent,
      startedAt: now,
      expiresAt: now + INTENT_CHECKIN_DURATION_MS,
      completedAt: outcome === "active" ? null : now,
      outcome,
      dateKey: getDateKey(now)
    };
    await this.repository.add(record);
    return record;
  }
}
