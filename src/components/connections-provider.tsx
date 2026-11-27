"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import type { DashboardData } from "@/lib/types";

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

function LinkFlow({ token, onSuccess, onExit }: {
  token: string;
  onSuccess: (token: string | null, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: (message: string) => void;
}) {
  const { open, ready, error } = usePlaidLink({
    token, onSuccess,
    onExit: (error) => onExit(error ? "The connection wasn’t completed. Please try again." : "Connection canceled."),
  });
  useEffect(() => { if (ready) open(); }, [ready, open]);
  useEffect(() => { if (error) onExit("Plaid couldn’t open. Check your connection and try again."); }, [error, onExit]);
  useEffect(() => {
    if (ready) return;
    const timeout = setTimeout(() => onExit("Plaid is taking too long to open. Please try again."), 20000);
    return () => clearTimeout(timeout);
  }, [ready, onExit]);
  return null;
}

// A success message belongs to one page, so it disappears when the user navigates away.
type Message = { text: string; path: string };
type Connections = {
  data: DashboardData;
  loading: boolean;
  busy: string | null;
  message: Message | null;
  error: string;
  disabled: boolean;
  connect: () => Promise<void>;
  refresh: () => Promise<boolean>;
  disconnect: (id: string) => Promise<boolean>;
};

const ConnectionsContext = createContext<Connections | null>(null);

export function useConnections(): Connections {
  const value = useContext(ConnectionsContext);
  if (!value) throw new Error("useConnections must be used inside ConnectionsProvider.");
  return value;
}

// Loads connections only for a signed-in user, and clears them on sign-out.
export function ConnectionsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [data, setData] = useState<DashboardData>({ connections: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [error, setError] = useState("");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => { path.current = pathname; }, [pathname]);

  useEffect(() => {
    setData({ connections: [] }); setError(""); setMessage(null);
    if (!enabled) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    api<DashboardData>("/api/connections").then((data) => { if (active) setData(data); })
      .catch(() => { if (active) setError("Couldn’t load your connections. Reload this page to try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled]);

  const finishLink = useCallback((text: string) => {
    setLinkToken(null); setBusy(null); setMessage({ text, path: path.current });
  }, []);

  const connected = useCallback(async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
    if (!publicToken) { setLinkToken(null); setBusy(null); setError("Plaid did not return a connection token. Please connect again."); return; }
    setLinkToken(null); setBusy("Saving connection");
    try {
      setData(await api<DashboardData>("/api/plaid/exchange", "POST", { publicToken, institution: metadata.institution?.name }));
      setMessage({ text: "Institution connected.", path: path.current });
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t save this connection. Please connect again."); }
    finally { setBusy(null); }
  }, []);

  async function connect() {
    setBusy("Opening Plaid"); setError(""); setMessage(null);
    try { setLinkToken((await api<{ linkToken: string }>("/api/plaid/link-token", "POST")).linkToken); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn’t open Plaid."); setBusy(null); }
  }

  async function update(method: "POST" | "DELETE", id?: string): Promise<boolean> {
    setBusy(method === "DELETE" ? "Disconnecting institution" : "Refreshing details"); setError(""); setMessage(null);
    try {
      const result = await api<DashboardData>("/api/connections", method, id ? { id } : undefined);
      setData({ connections: result.connections });
      setMessage(method === "DELETE"
        ? { text: result.notice ?? "Institution disconnected.", path: "/cards" }
        : { text: result.connections.some((item) => item.error) ? "Some details couldn’t refresh." : "Card details refreshed.", path: path.current });
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t update your connections."); return false; }
    finally { setBusy(null); }
  }

  const value: Connections = {
    data, loading, busy, message, error, disabled: loading || busy !== null,
    connect, refresh: () => update("POST"), disconnect: (id) => update("DELETE", id),
  };
  return <ConnectionsContext.Provider value={value}>
    {children}
    {linkToken && <LinkFlow token={linkToken} onSuccess={connected} onExit={finishLink} />}
  </ConnectionsContext.Provider>;
}

// One status line for the whole app: progress and page-specific messages, plus persistent errors.
export function StatusLine() {
  const { busy, message, error } = useConnections();
  const pathname = usePathname();
  const text = busy ? `${busy}…` : message?.path === pathname ? message.text : "";
  return <>
    <p className="status" role="status">{text}</p>
    {error && <p className="notice error" role="alert">{error}</p>}
  </>;
}
