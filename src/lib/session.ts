import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Connection } from "./types";

export type StoredConnection = Connection & { accessToken: string };
type Session = { id: string; connections: Map<string, StoredConnection>; busy: boolean };

// Preserve local sessions across development hot reloads. Never persist tokens to disk.
const globalStore = globalThis as typeof globalThis & { snowballSessions?: Map<string, Session> };
const sessions = globalStore.snowballSessions ??= new Map<string, Session>();
const cookieName = "snowball_session";

export async function getSession(create = false): Promise<Session | null> {
  const jar = await cookies();
  const id = jar.get(cookieName)?.value;
  if (id && sessions.has(id)) return sessions.get(id)!;
  if (!create) return null;
  const session: Session = {
    id: randomBytes(32).toString("hex"), connections: new Map(), busy: false,
  };
  sessions.set(session.id, session);
  jar.set(cookieName, session.id, {
    httpOnly: true, sameSite: "strict", path: "/",
    secure: new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3000").protocol === "https:",
  });
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
