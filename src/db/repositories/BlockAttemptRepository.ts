import { openDatabase, requestToPromise, transactionDone } from "../database";
import { INDEX_DATE_DOMAIN, STORE_BLOCK_ATTEMPTS } from "../schema";
import { getDateKey, minuteBucketKey } from "@/shared/time";
import type { BlockAttempt } from "@/shared/types";

export class BlockAttemptRepository {
  async recordNavigationAttempt(domain: string, now: number): Promise<BlockAttempt> {
    const dateKey = getDateKey(now);
    const id = `${domain}::${minuteBucketKey(now)}`;
    const db = await openDatabase();
    const transaction = db.transaction(STORE_BLOCK_ATTEMPTS, "readwrite");
    const store = transaction.objectStore(STORE_BLOCK_ATTEMPTS);
    const existing = (await requestToPromise(store.get(id))) as BlockAttempt | undefined;

    const next: BlockAttempt = existing
      ? {
          ...existing,
          attemptedAt: now,
          count: existing.count + 1
        }
      : {
          id,
          domain,
          attemptedAt: now,
          dateKey,
          source: "navigation",
          count: 1
        };

    store.put(next);
    await transactionDone(transaction);
    return next;
  }

  async countForDate(domain: string, dateKey: string): Promise<number> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_BLOCK_ATTEMPTS, "readonly");
    const index = transaction.objectStore(STORE_BLOCK_ATTEMPTS).index(INDEX_DATE_DOMAIN);
    const range = IDBKeyRange.only([dateKey, domain]);
    const attempts = await requestToPromise(index.getAll(range));
    await transactionDone(transaction);
    return attempts.reduce((sum, attempt) => sum + attempt.count, 0);
  }

  async listAll(): Promise<BlockAttempt[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_BLOCK_ATTEMPTS, "readonly");
    const attempts = await requestToPromise(transaction.objectStore(STORE_BLOCK_ATTEMPTS).getAll());
    await transactionDone(transaction);
    return attempts.sort((a, b) => a.attemptedAt - b.attemptedAt);
  }
}
