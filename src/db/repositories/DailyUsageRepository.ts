import { openDatabase, requestToPromise, transactionDone } from "../database";
import { INDEX_DATE_KEY, STORE_DAILY_USAGE } from "../schema";
import { splitDurationByLocalDate } from "@/shared/time";
import type { DailyUsage, UsageSession } from "@/shared/types";

export class DailyUsageRepository {
  async addDuration(
    dateKey: string,
    domain: string,
    durationMs: number,
    sessionCountIncrement: number,
    now: number
  ): Promise<void> {
    if (durationMs <= 0 && sessionCountIncrement <= 0) {
      return;
    }

    const db = await openDatabase();
    const transaction = db.transaction(STORE_DAILY_USAGE, "readwrite");
    const store = transaction.objectStore(STORE_DAILY_USAGE);
    const id = `${dateKey}::${domain}`;
    const existing = (await requestToPromise(store.get(id))) as DailyUsage | undefined;

    const next: DailyUsage = existing
      ? {
          ...existing,
          durationMs: existing.durationMs + Math.max(0, durationMs),
          sessionCount: existing.sessionCount + sessionCountIncrement,
          lastUpdatedAt: now
        }
      : {
          id,
          dateKey,
          domain,
          durationMs: Math.max(0, durationMs),
          sessionCount: sessionCountIncrement,
          lastUpdatedAt: now
        };

    store.put(next);
    await transactionDone(transaction);
  }

  async addSession(session: UsageSession): Promise<void> {
    const slices = splitDurationByLocalDate(session.startedAt, session.endedAt);

    for (const slice of slices) {
      await this.addDuration(slice.dateKey, session.domain, slice.durationMs, 1, session.createdAt);
    }
  }

  async listByDate(dateKey: string): Promise<DailyUsage[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_DAILY_USAGE, "readonly");
    const index = transaction.objectStore(STORE_DAILY_USAGE).index(INDEX_DATE_KEY);
    const rows = await requestToPromise(index.getAll(dateKey));
    await transactionDone(transaction);
    return rows.sort((a, b) => b.durationMs - a.durationMs);
  }
}
