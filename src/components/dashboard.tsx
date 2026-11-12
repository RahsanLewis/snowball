"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import type { Card, DashboardData } from "@/lib/types";

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

function money(value: number | null, currency: string | null) {
  if (value === null) return "Not provided";
  if (!currency) return `${value.toLocaleString(undefined, { minimumFractionDigits: 2 })} (currency unknown)`;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

function dueDate(value: string | null) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function LinkFlow({ token, onSuccess, onExit }: {
  token: string;
  onSuccess: (token: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: (message: string) => void;
}) {
  const { open, ready, error } = usePlaidLink({
    token, onSuccess,
    onExit: (error) => onExit(error ? "The connection wasn’t completed. Please try again." : "Connection canceled. You can connect a card whenever you’re ready."),
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

function CardDetails({ card }: { card: Card }) {
  return <article className="card">
    <div className="card-heading"><span className="card-icon" aria-hidden="true">▰</span><span className="muted">{card.mask ? `•••• ${card.mask}` : "Credit card"}</span></div>
    <h3>{card.name}</h3>
    <p className="balance-label">Current balance</p>
    <p className="balance">{money(card.balance, card.currency)}</p>
    <dl>
      <div><dt>Minimum payment</dt><dd>{money(card.minimumPayment, card.currency)}</dd></div>
      <div><dt>Payment due</dt><dd>{dueDate(card.dueDate)}</dd></div>
      <div className="apr-row"><dt>APR</dt><dd>{card.aprs.length ? card.aprs.map((apr, index) => <span key={`${apr.type}-${index}`}>{apr.percentage.toLocaleString()}% <small>{apr.type.replaceAll("_", " ")}</small></span>) : "Not provided"}</dd></div>
    </dl>
  </article>;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData>({ connections: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<DashboardData>("/api/connections").then((data) => { if (active) setData(data); })
      .catch(() => { if (active) setError("Couldn’t load your connections. Reload this page to try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const finishLink = useCallback((message: string) => {
    setLinkToken(null); setBusy(null); setMessage(message);
  }, []);

  const connected = useCallback(async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    setLinkToken(null); setBusy("Saving connection");
    try {
      setData(await api<DashboardData>("/api/plaid/exchange", "POST", { publicToken, institution: metadata.institution?.name }));
      setMessage("Institution connected. Your available card details are below.");
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t save this connection. Please connect again."); }
    finally { setBusy(null); }
  }, []);

  async function connect() {
    setBusy("Opening Plaid"); setError(""); setMessage("");
    try { setLinkToken((await api<{ linkToken: string }>("/api/plaid/link-token", "POST")).linkToken); }
    catch (error) { setError(error instanceof Error ? error.message : "Couldn’t open Plaid."); setBusy(null); }
  }

  async function update(method: "POST" | "DELETE", id?: string) {
    setBusy(method === "DELETE" ? "Disconnecting institution" : "Refreshing details"); setError(""); setMessage("");
    try {
      const result = await api<DashboardData>("/api/connections", method, id ? { id } : undefined);
      setData(result);
      setMessage(method === "DELETE" ? "Institution disconnected." : result.connections.some((item) => item.error) ? "Some details couldn’t refresh. See the messages below." : "Fetched the latest details available from Plaid.");
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t update your connections."); }
    finally { setBusy(null); }
  }

  const cards = data.connections.flatMap((connection) => connection.cards);
  const usdCards = cards.filter((card) => card.currency === "USD" && card.balance !== null);
  const total = usdCards.reduce((sum, card) => sum + card.balance!, 0);
  const disabled = loading || busy !== null;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Snowball home"><span className="brand-mark" aria-hidden="true">◒</span> snowball<span className="brand-dot">.</span></a><span className="sandbox-badge"><span /> Sandbox</span></header>
    <main>
      <div className="intro"><div><p className="eyebrow">SMALL STEPS. REAL PROGRESS.</p><h1>Your fresh start<br />starts with clarity.</h1><p className="intro-copy">Bring your credit cards into one place.<br />Get a clear picture of what you owe.</p></div><div className="orbit" aria-hidden="true"><div /><div /><div /><span>↗</span></div></div>
      <section className="overview" aria-label="Debt overview"><div><p className="eyebrow">CONNECTED BALANCE · USD</p><p className="total">{usdCards.length ? money(total, "USD") : "—"}</p><p className="muted">{cards.length ? `${usdCards.length} of ${cards.length} cards included · balances may be cached` : "Your first step toward a clearer picture"}</p></div><div className="overview-stat"><strong>{cards.length}</strong><span>connected {cards.length === 1 ? "card" : "cards"}</span></div></section>
      <section aria-labelledby="cards-title" aria-busy={disabled}>
        <div className="section-heading"><div><h2 id="cards-title">Your credit cards</h2><p className="muted">One place to see where you stand.</p></div><div className="actions">{data.connections.length > 0 && <button className="secondary" disabled={disabled} onClick={() => update("POST")}>Refresh details</button>}<button className="primary" disabled={disabled} onClick={connect}><span aria-hidden="true">＋</span> Connect credit card</button></div></div>
        {busy && <p className="notice" role="status">{busy}…</p>}
        {message && <p className="notice" role="status">{message}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {loading ? <div className="empty" role="status">Loading your connections…</div> : data.connections.length === 0 ? <div className="empty"><span className="empty-icon" aria-hidden="true">▰</span><h3>A little clarity goes a long way.</h3><p>Connect your first credit card to see your balance,<br className="desktop-break" /> interest rates, and upcoming payment details.</p><button className="primary" disabled={disabled} onClick={connect}>Connect your first card <span aria-hidden="true">↗</span></button><span className="empty-note">Connected through Plaid · Sandbox test accounts only</span></div> : <div className="institutions">{data.connections.map((connection) => <section key={connection.id} className="institution" aria-label={connection.institution}><div className="institution-heading"><div><h3>{connection.institution}</h3><p className="muted">{connection.fetchedAt ? `Fetched ${new Date(connection.fetchedAt).toLocaleString()}` : "Awaiting card details"}</p></div><button className="text-button" disabled={disabled} onClick={() => update("DELETE", connection.id)}>Disconnect institution</button></div>{connection.error && <p className="notice error" role="alert">{connection.error}{connection.fetchedAt ? " Showing previously fetched details." : ""}</p>}<div className="card-grid">{connection.cards.map((card) => <CardDetails key={card.id} card={card} />)}</div>{!connection.cards.length && !connection.error && <p className="notice">No credit cards were returned for this connection.</p>}</section>)}</div>}
      </section>
      <aside className="footnote"><span aria-hidden="true">ⓘ</span><p><strong>A first step, at your pace.</strong> This local prototype uses test accounts. Connections reset when the server restarts. Missing details are marked “Not provided”; refreshing fetches available Plaid data and does not guarantee a live bank update.</p></aside>
    </main><footer><span>snowball.</span><span>A clearer path forward.</span></footer>
    {linkToken && <LinkFlow token={linkToken} onSuccess={connected} onExit={finishLink} />}
  </div>;
}
