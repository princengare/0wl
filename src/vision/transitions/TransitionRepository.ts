import { openDatabase, requestToPromise, transactionDone } from "@/db/database";
import {
  INDEX_STARTED_AT,
  INDEX_TRANSITIONED_AT,
  STORE_DOMAIN_TRANSITIONS,
  STORE_SESSIONS
} from "@/db/schema";
import type { UsageSession } from "@/shared/types";
import type { DomainTransition } from "../types";

export class TransitionRepository {
  async add(transition: DomainTransition): Promise<void> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_DOMAIN_TRANSITIONS, "readwrite");
    transaction.objectStore(STORE_DOMAIN_TRANSITIONS).put(transition);
    await transactionDone(transaction);
  }

  async getPreviousSession(startedBefore: number): Promise<UsageSession | null> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_SESSIONS, "readonly");
    const index = transaction.objectStore(STORE_SESSIONS).index(INDEX_STARTED_AT);
    const range = IDBKeyRange.upperBound(startedBefore, true);
    const sessions = await requestToPromise(index.getAll(range));
    await transactionDone(transaction);
    return (
      sessions
        .filter((session) => session.endedAt <= startedBefore)
        .sort((a, b) => b.endedAt - a.endedAt)[0] ?? null
    );
  }

  async listBetween(startInclusive: number, endExclusive: number): Promise<DomainTransition[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_DOMAIN_TRANSITIONS, "readonly");
    const index = transaction.objectStore(STORE_DOMAIN_TRANSITIONS).index(INDEX_TRANSITIONED_AT);
    const range = IDBKeyRange.bound(startInclusive, endExclusive, false, true);
    const transitions = await requestToPromise(index.getAll(range));
    await transactionDone(transaction);
    return transitions.sort((a, b) => a.transitionedAt - b.transitionedAt);
  }

  async listAll(): Promise<DomainTransition[]> {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_DOMAIN_TRANSITIONS, "readonly");
    const transitions = await requestToPromise(
      transaction.objectStore(STORE_DOMAIN_TRANSITIONS).getAll()
    );
    await transactionDone(transaction);
    return transitions.sort((a, b) => a.transitionedAt - b.transitionedAt);
  }
}
