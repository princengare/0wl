import { openDatabase, requestToPromise, transactionDone } from "@/db/database";
import { INDEX_STARTED_AT, STORE_BROWSING_INTENTS } from "@/db/schema";
import type { BrowsingIntent } from "../types";

export class BrowsingIntentRepository {
  async add(intent: BrowsingIntent): Promise<void> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_BROWSING_INTENTS, "readwrite");
    transaction.objectStore(STORE_BROWSING_INTENTS).put(intent);
    await transactionDone(transaction);
  }

  async listBetween(startInclusive: number, endExclusive: number): Promise<BrowsingIntent[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_BROWSING_INTENTS, "readonly");
    const index = transaction.objectStore(STORE_BROWSING_INTENTS).index(INDEX_STARTED_AT);
    const range = IDBKeyRange.bound(startInclusive, endExclusive, false, true);
    const intents = await requestToPromise(index.getAll(range));
    await transactionDone(transaction);
    return intents.sort((a, b) => a.startedAt - b.startedAt);
  }
}
