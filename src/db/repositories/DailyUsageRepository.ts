import { openDatabase, requestToPromise, transactionDone } from "../database";
import { INDEX_DATE_KEY, STORE_DAILY_USAGE } from "../schema";
import { splitDurationByLocalDate } from "@/shared/time";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { DailyUsage, UsageSession, WindowScope } from "@/shared/types";

function dailyUsageId(dateKey: string, domain: string, windowScope: WindowScope): string {
  return windowScope === "regular"
    ? `${dateKey}::${domain}`
    : `${dateKey}::${windowScope}::${domain}`;
}

function normalizeDailyUsage(row: DailyUsage): DailyUsage {
  return {
    ...row,
    windowScope: normalizeWindowScope(row.windowScope)
  };
}

export class DailyUsageRepository {
  async addDuration(
    dateKey: string,
    domain: string,
    durationMs: number,
    sessionCountIncrement: number,
    now: number,
    windowScope: WindowScope = "regular"
  ): Promise<void> {
    if (durationMs <= 0 && sessionCountIncrement <= 0) {
      return;
    }

    const db = await openDatabase();
    const transaction = db.transaction(STORE_DAILY_USAGE, "readwrite");
    const store = transaction.objectStore(STORE_DAILY_USAGE);
    const id = dailyUsageId(dateKey, domain, windowScope);
    const existingRow = (await requestToPromise(store.get(id))) as DailyUsage | undefined;
    const existing = existingRow ? normalizeDailyUsage(existingRow) : undefined;

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
          windowScope,
          durationMs: Math.max(0, durationMs),
          sessionCount: sessionCountIncrement,
          lastUpdatedAt: now
        };

    store.put(next);
    await transactionDone(transaction);
  }

  async addSession(session: UsageSession): Promise<void> {
    if (session.usageMode && session.usageMode !== "active") {
      return;
    }

    const slices = splitDurationByLocalDate(session.startedAt, session.endedAt);

    for (const slice of slices) {
      await this.addDuration(
        slice.dateKey,
        session.domain,
        slice.durationMs,
        1,
        session.createdAt,
        normalizeWindowScope(session.windowScope)
      );
    }
  }

  async listByDate(dateKey: string, windowScope: WindowScope = "regular"): Promise<DailyUsage[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_DAILY_USAGE, "readonly");
    const index = transaction.objectStore(STORE_DAILY_USAGE).index(INDEX_DATE_KEY);
    const rows = await requestToPromise(index.getAll(dateKey));
    await transactionDone(transaction);
    return rows
      .map(normalizeDailyUsage)
      .filter((row) => row.windowScope === windowScope)
      .sort((a, b) => b.durationMs - a.durationMs);
  }
}
