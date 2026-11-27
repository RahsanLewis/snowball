import "server-only";
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { accountLocks, payoffPlans, plaidItems } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { Card, Connection, PayoffPlan } from "@/lib/types";

// Account data: each person's connections and payoff plan, stored in Postgres. Every
// query is scoped to the signed-in user's id. Access tokens are encrypted, bound to their
// user and Plaid Item, and decrypted only when a Plaid call needs them.

const tokenContext = (userId: string, connectionId: string) => `${userId}:${connectionId}`;

export async function addConnection(userId: string, connection: { id: string; institution: string; accessToken: string }) {
  await db().insert(plaidItems).values({
    userId, plaidItemId: connection.id, institution: connection.institution,
    accessTokenCiphertext: encryptSecret(connection.accessToken, tokenContext(userId, connection.id)),
  });
}

// Public connection data only; tokens never leave the store. Oldest first, so card order
// (and equal-APR tie-breaking in plans) stays stable.
export async function listConnections(userId: string): Promise<Connection[]> {
  const rows = await db().select({
    id: plaidItems.plaidItemId, institution: plaidItems.institution, cards: plaidItems.cards,
    fetchedAt: plaidItems.fetchedAt, error: plaidItems.error,
  }).from(plaidItems).where(eq(plaidItems.userId, userId)).orderBy(asc(plaidItems.createdAt), asc(plaidItems.plaidItemId));
  return rows.map((row) => ({ ...row, fetchedAt: row.fetchedAt?.toISOString() ?? null }));
}

export async function saveCards(userId: string, connectionId: string, fetched: { cards: Card[]; fetchedAt: string }) {
  await db().update(plaidItems).set({ cards: fetched.cards, fetchedAt: new Date(fetched.fetchedAt), error: null })
    .where(and(eq(plaidItems.userId, userId), eq(plaidItems.plaidItemId, connectionId)));
}

// Keeps previously fetched cards, so a failed refresh doesn't hide the last known details.
export async function markConnectionError(userId: string, connectionId: string, error: string) {
  await db().update(plaidItems).set({ error })
    .where(and(eq(plaidItems.userId, userId), eq(plaidItems.plaidItemId, connectionId)));
}

export async function removeConnection(userId: string, connectionId: string) {
  await db().delete(plaidItems).where(and(eq(plaidItems.userId, userId), eq(plaidItems.plaidItemId, connectionId)));
}

// Null when this user has no such connection. Throws TOKEN_UNREADABLE when the stored
// token can't be decrypted (for example, TOKEN_ENCRYPTION_KEY changed).
export async function accessTokenFor(userId: string, connectionId: string): Promise<string | null> {
  const [row] = await db().select({ ciphertext: plaidItems.accessTokenCiphertext }).from(plaidItems)
    .where(and(eq(plaidItems.userId, userId), eq(plaidItems.plaidItemId, connectionId)));
  if (!row) return null;
  try { return decryptSecret(row.ciphertext, tokenContext(userId, connectionId)); }
  catch { throw new Error("TOKEN_UNREADABLE"); }
}

// The saved payoff plan, exactly as saved. Older saved shapes are possible; callers check `version`.
export async function getPayoffPlan(userId: string): Promise<PayoffPlan | null> {
  const [row] = await db().select({ plan: payoffPlans.plan }).from(payoffPlans).where(eq(payoffPlans.userId, userId));
  return row?.plan ?? null;
}

// Each person has at most one payoff plan; saving replaces it.
export async function savePayoffPlan(userId: string, plan: PayoffPlan) {
  const updatedAt = new Date();
  await db().insert(payoffPlans).values({ userId, plan, updatedAt })
    .onConflictDoUpdate({ target: payoffPlans.userId, set: { plan, updatedAt } });
}

// Long enough for a Plaid token exchange plus a card fetch (20-second timeout each).
const LOCK_MS = 90_000;

// Runs one account action at a time per user, across restarts and server instances.
// The lock expires on its own, so a crash can't block the account for long.
export async function withAccountLock<T>(userId: string, action: () => Promise<T>, now = new Date()): Promise<T> {
  const lockedUntil = new Date(now.getTime() + LOCK_MS);
  const [lock] = await db().insert(accountLocks).values({ userId, lockedUntil })
    .onConflictDoUpdate({ target: accountLocks.userId, set: { lockedUntil }, setWhere: lt(accountLocks.lockedUntil, now) })
    .returning({ lockedUntil: accountLocks.lockedUntil });
  if (!lock) throw new Error("ACCOUNT_BUSY");
  try { return await action(); }
  finally {
    // Only release our own lock: if it expired and someone else took over, theirs stays.
    await db().delete(accountLocks).where(and(eq(accountLocks.userId, userId), eq(accountLocks.lockedUntil, lockedUntil)));
  }
}
