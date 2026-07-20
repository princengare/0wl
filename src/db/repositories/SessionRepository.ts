import { openDatabase, requestToPromise, transactionDone } from "../database";
import { INDEX_DATE_KEY, INDEX_STARTED_AT, STORE_SESSIONS } from "../schema";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { UsageMode, UsageSession, WindowScope } from "@/shared/types";

function normalizeUsageMode(value: unknown): UsageMode {
  return value === "pip" || value === "background" ? value : "active";
}

function normalizeSession(session: UsageSession): UsageSession {
  return {
    ...session,
    windowScope: normalizeWindowScope(session.windowScope),
    usageMode: normalizeUsageMode(session.usageMode)
  };
}

function filterScopeAndMode(
  sessions: UsageSession[],
  windowScope?: WindowScope,
  usageMode?: UsageMode
): UsageSession[] {
  const normalized = sessions.map(normalizeSession);
  const scoped = windowScope
    ? normalized.filter((session) => session.windowScope === windowScope)
    : normalized;

  return usageMode ? scoped.filter((session) => session.usageMode === usageMode) : scoped;
}

export class SessionRepository {
  async add(session: UsageSession): Promise<void> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readwrite");
    transaction.objectStore(STORE_SESSIONS).add(session);
    await transactionDone(transaction);
  }

  async getByDateKey(
    dateKey: string,
    windowScope?: WindowScope,
    usageMode?: UsageMode
  ): Promise<UsageSession[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readonly");
    const index = transaction.objectStore(STORE_SESSIONS).index(INDEX_DATE_KEY);
    const sessions = await requestToPromise(index.getAll(dateKey));
    await transactionDone(transaction);
    return filterScopeAndMode(sessions, windowScope, usageMode).sort(
      (a, b) => b.startedAt - a.startedAt
    );
  }

  async getBetween(
    startedAtInclusive: number,
    endedAtExclusive: number,
    windowScope?: WindowScope,
    usageMode?: UsageMode
  ): Promise<UsageSession[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readonly");
    const index = transaction.objectStore(STORE_SESSIONS).index(INDEX_STARTED_AT);
    const range = IDBKeyRange.bound(startedAtInclusive, endedAtExclusive, false, true);
    const sessions = await requestToPromise(index.getAll(range));
    await transactionDone(transaction);
    return filterScopeAndMode(sessions, windowScope, usageMode).sort(
      (a, b) => b.startedAt - a.startedAt
    );
  }

  async getOverlapping(
    startInclusive: number,
    endExclusive: number,
    windowScope?: WindowScope,
    usageMode?: UsageMode
  ): Promise<UsageSession[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readonly");
    const index = transaction.objectStore(STORE_SESSIONS).index(INDEX_STARTED_AT);
    const range = IDBKeyRange.upperBound(endExclusive, true);
    const sessions = await requestToPromise(index.getAll(range));
    await transactionDone(transaction);
    return filterScopeAndMode(sessions, windowScope, usageMode)
      .filter((session) => session.endedAt > startInclusive && session.startedAt < endExclusive)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  async listAll(): Promise<UsageSession[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readonly");
    const sessions = await requestToPromise(transaction.objectStore(STORE_SESSIONS).getAll());
    await transactionDone(transaction);
    return sessions.map(normalizeSession).sort((a, b) => a.startedAt - b.startedAt);
  }
}
