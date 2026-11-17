import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env.local itself. `generate` needs no database; `migrate` does.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Supabase owns the auth schema; only manage Snowball's tables.
  schemaFilter: ["public"],
  // Migrations need a session-mode or direct connection; the app itself uses the transaction pooler.
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? "" },
});
