import "fake-indexeddb/auto";
import { afterEach, vi } from "vitest";
import { resetDatabaseConnectionForTests } from "@/db/database";

afterEach(() => {
  vi.restoreAllMocks();
  resetDatabaseConnectionForTests();
});
