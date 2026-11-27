// Test-only Postgres: PGlite runs in memory with Snowball's real migration applied,
// so tests exercise the same SQL, constraints, and foreign keys as Supabase.
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");

const migration = readFileSync(path.join(__dirname, "..", "..", "drizzle", "0000_init.sql"), "utf8");

// Resolve "@/db/client" to this so app code under test talks to the test database.
const dbClientModule = "data:text/javascript,export function db(){return globalThis.__snowballTestDb()}";

async function createTestDb() {
  const schema = require("../db/schema.ts");
  const client = new PGlite();
  // Supabase owns auth.users; the migration only needs a table to reference.
  await client.exec("create schema auth; create table auth.users (id uuid primary key);");
  for (const statement of migration.split("--> statement-breakpoint")) await client.exec(statement);
  const db = drizzle(client, { schema });
  globalThis.__snowballTestDb = () => db;
  return {
    client,
    addUser: (id) => client.query("insert into auth.users (id) values ($1)", [id]),
    async close() {
      delete globalThis.__snowballTestDb;
      await client.close();
    },
  };
}

module.exports = { createTestDb, dbClientModule };
