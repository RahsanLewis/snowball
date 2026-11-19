import "server-only";
import { requireUser } from "@/lib/auth";
import type { Connection, PayoffPlan } from "./types";

export type StoredConnection = Connection & { accessToken: string };
type Session = { id: string; connections: Map<string, StoredConnection>; busy: boolean; payoffPlan?: PayoffPlan };

// Temporary in-memory store keyed by the signed-in user, until connections and plans move to
// Postgres. Preserved across development hot reloads. Never persist tokens to disk.
const globalStore = globalThis as typeof globalThis & { snowballUserStores?: Map<string, Session> };
const sessions = globalStore.snowballUserStores ??= new Map<string, Session>();

// Throws a 401 RequestError when nobody is signed in.
export async function getSession(): Promise<Session> {
  const user = await requireUser();
  let session = sessions.get(user.id);
  if (!session) {
    session = { id: user.id, connections: new Map(), busy: false };
    sessions.set(user.id, session);
  }
  return session;
}

export function publicConnections(session: Session | null) {
  return [...(session?.connections.values() ?? [])].map(({ accessToken: _secret, ...connection }) => connection);
}

export async function withSessionLock<T>(session: Session, action: () => Promise<T>): Promise<T> {
  if (session.busy) throw new Error("SESSION_BUSY");
  session.busy = true;
  try { return await action(); } finally { session.busy = false; }
}
