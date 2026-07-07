import { openDatabase, requestToPromise, transactionDone } from "../database";
import { INDEX_DATE_KEY, INDEX_STARTED_AT, STORE_SESSIONS } from "../schema";
import type { UsageSession } from "@/shared/types";

export class SessionRepository {
  async add(session: UsageSession): Promise<void> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readwrite");
    transaction.objectStore(STORE_SESSIONS).add(session);
    await transactionDone(transaction);
  }

  async getByDateKey(dateKey: string): Promise<UsageSession[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readonly");
    const index = transaction.objectStore(STORE_SESSIONS).index(INDEX_DATE_KEY);
    const sessions = await requestToPromise(index.getAll(dateKey));
    await transactionDone(transaction);
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  }

  async getBetween(startedAtInclusive: number, endedAtExclusive: number): Promise<UsageSession[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readonly");
    const index = transaction.objectStore(STORE_SESSIONS).index(INDEX_STARTED_AT);
    const range = IDBKeyRange.bound(startedAtInclusive, endedAtExclusive, false, true);
    const sessions = await requestToPromise(index.getAll(range));
    await transactionDone(transaction);
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  }
}
