import { openDatabase, requestToPromise, transactionDone } from "../database";
import { INDEX_DATE_DOMAIN, STORE_BLOCK_ATTEMPTS } from "../schema";
import { getDateKey, minuteBucketKey } from "@/shared/time";
import { normalizeWindowScope } from "@/platform/windowScope";
import type { BlockAttempt, WindowScope } from "@/shared/types";

function attemptId(domain: string, now: number, windowScope: WindowScope): string {
  const bucket = minuteBucketKey(now);
  return windowScope === "regular" ? `${domain}::${bucket}` : `${domain}::${windowScope}::${bucket}`;
}

function normalizeAttempt(attempt: BlockAttempt): BlockAttempt {
  return {
    ...attempt,
    windowScope: normalizeWindowScope(attempt.windowScope)
  };
}

export class BlockAttemptRepository {
  async recordNavigationAttempt(
    domain: string,
    now: number,
    windowScope: WindowScope = "regular"
  ): Promise<BlockAttempt> {
    const dateKey = getDateKey(now);
    const id = attemptId(domain, now, windowScope);
    const db = await openDatabase();
    const transaction = db.transaction(STORE_BLOCK_ATTEMPTS, "readwrite");
    const store = transaction.objectStore(STORE_BLOCK_ATTEMPTS);
    const existingRow = (await requestToPromise(store.get(id))) as BlockAttempt | undefined;
    const existing = existingRow ? normalizeAttempt(existingRow) : undefined;

    const next: BlockAttempt = existing
      ? {
          ...existing,
          attemptedAt: now,
          count: existing.count + 1
        }
      : {
          id,
          domain,
          windowScope,
          attemptedAt: now,
          dateKey,
          source: "navigation",
          count: 1
        };

    store.put(next);
    await transactionDone(transaction);
    return next;
  }

  async countForDate(
    domain: string,
    dateKey: string,
    windowScope: WindowScope = "regular"
  ): Promise<number> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_BLOCK_ATTEMPTS, "readonly");
    const index = transaction.objectStore(STORE_BLOCK_ATTEMPTS).index(INDEX_DATE_DOMAIN);
    const range = IDBKeyRange.only([dateKey, domain]);
    const attempts = (await requestToPromise(index.getAll(range))).map(normalizeAttempt);
    await transactionDone(transaction);
    return attempts
      .filter((attempt) => attempt.windowScope === windowScope)
      .reduce((sum, attempt) => sum + attempt.count, 0);
  }

  async listAll(): Promise<BlockAttempt[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_BLOCK_ATTEMPTS, "readonly");
    const attempts = await requestToPromise(transaction.objectStore(STORE_BLOCK_ATTEMPTS).getAll());
    await transactionDone(transaction);
    return attempts.map(normalizeAttempt).sort((a, b) => a.attemptedAt - b.attemptedAt);
  }
}
