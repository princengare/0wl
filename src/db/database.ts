import {
  DB_NAME,
  DB_VERSION,
  INDEX_DATE_DOMAIN,
  INDEX_DATE_KEY,
  INDEX_DOMAIN,
  INDEX_ENDED_AT,
  INDEX_STARTED_AT,
  STORE_BLOCK_ATTEMPTS,
  STORE_DAILY_USAGE,
  STORE_SESSIONS
} from "./schema";

let databasePromise: Promise<IDBDatabase> | null = null;

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function createStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
    const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
    sessions.createIndex(INDEX_DOMAIN, "domain", { unique: false });
    sessions.createIndex(INDEX_STARTED_AT, "startedAt", { unique: false });
    sessions.createIndex(INDEX_ENDED_AT, "endedAt", { unique: false });
    sessions.createIndex(INDEX_DATE_KEY, "dateKey", { unique: false });
    sessions.createIndex(INDEX_DATE_DOMAIN, ["dateKey", "domain"], { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_DAILY_USAGE)) {
    const dailyUsage = db.createObjectStore(STORE_DAILY_USAGE, { keyPath: "id" });
    dailyUsage.createIndex(INDEX_DATE_KEY, "dateKey", { unique: false });
    dailyUsage.createIndex(INDEX_DOMAIN, "domain", { unique: false });
    dailyUsage.createIndex(INDEX_DATE_DOMAIN, ["dateKey", "domain"], { unique: true });
  }

  if (!db.objectStoreNames.contains(STORE_BLOCK_ATTEMPTS)) {
    const attempts = db.createObjectStore(STORE_BLOCK_ATTEMPTS, { keyPath: "id" });
    attempts.createIndex(INDEX_DOMAIN, "domain", { unique: false });
    attempts.createIndex(INDEX_DATE_KEY, "dateKey", { unique: false });
    attempts.createIndex(INDEX_DATE_DOMAIN, ["dateKey", "domain"], { unique: false });
  }
}

export async function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      createStores(request.result);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });

  return databasePromise;
}

export function resetDatabaseConnectionForTests(): void {
  databasePromise = null;
}
