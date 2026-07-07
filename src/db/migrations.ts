import { openDatabase } from "./database";

export async function runMigrations(): Promise<void> {
  await openDatabase();
}
