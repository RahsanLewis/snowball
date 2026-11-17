import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Created lazily so builds and tests don't need a database. Reused across dev hot reloads.
const globalStore = globalThis as typeof globalThis & { snowballSql?: postgres.Sql };

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  // Supabase's transaction pooler doesn't support prepared statements.
  globalStore.snowballSql ??= postgres(url, { prepare: false, max: 5 });
  return drizzle(globalStore.snowballSql, { schema });
}
