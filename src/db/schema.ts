import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import type { Card, PayoffPlan } from "../lib/types";

// Every table has row-level security enabled with no policies: the browser's public Supabase
// key can reach the Data API, but these tables are only read and written by server routes,
// which connect directly and scope every query to the signed-in user.

export const plaidItems = pgTable("plaid_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  // RESTRICT: deleting a user must first remove their Items at Plaid, or billing continues.
  userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
  plaidItemId: text("plaid_item_id").notNull().unique(),
  institution: text("institution").notNull(),
  accessTokenCiphertext: text("access_token_ciphertext").notNull(),
  cards: jsonb("cards").$type<Card[]>().notNull().default(sql`'[]'::jsonb`),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("plaid_items_user_id_idx").on(table.userId)]).enableRLS();

export const payoffPlans = pgTable("payoff_plans", {
  userId: uuid("user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  plan: jsonb("plan").$type<PayoffPlan>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Short per-user lease so concurrent account actions (refresh, connect, disconnect, save plan)
// don't overlap, even across multiple server instances.
export const accountLocks = pgTable("account_locks", {
  userId: uuid("user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
}).enableRLS();
