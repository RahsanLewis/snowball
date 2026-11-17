"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { dueDate, money } from "@/lib/format";
import { useConnections } from "./connections-provider";

const cardHref = (id: string) => `/cards/${encodeURIComponent(id)}`;

export function CardList() {
  const { data, loading, disabled, connect, refresh, disconnect } = useConnections();
  return <>
    <header className="page-head">
      <h1>Cards</h1>
      <div className="actions">
        {data.connections.length > 0 && <button className="secondary" disabled={disabled} onClick={() => void refresh()}>Refresh</button>}
        <button className="primary" disabled={disabled} onClick={() => void connect()}>Connect card</button>
      </div>
    </header>
    {loading ? <p className="muted" role="status">Loading…</p> : !data.connections.length
      ? <p className="muted">No cards connected yet.</p>
      : data.connections.map((connection) => <section key={connection.id} className="group" aria-labelledby={`institution-${connection.id}`}>
        <div className="group-head">
          <h2 id={`institution-${connection.id}`}>{connection.institution}</h2>
          {/* Card pages hold the disconnect action; an institution without cards needs it here. */}
          {!connection.cards.length && <button className="text-button" disabled={disabled} onClick={() => void disconnect(connection.id)}>Disconnect</button>}
        </div>
        {connection.error && <p className="notice error" role="alert">{connection.error}{connection.fetchedAt ? " Showing previously fetched details." : ""}</p>}
        {connection.cards.length > 0 && <ul className="rows">{connection.cards.map((card) => <li key={card.id}>
          <Link className="row" href={cardHref(card.id)}>
            <span className="row-main"><span className="row-title">{card.name}</span>{card.mask && <span className="muted">•••• {card.mask}</span>}</span>
            <span className="amount">{money(card.balance, card.currency)}</span>
            <span className="chev" aria-hidden="true">›</span>
          </Link>
        </li>)}</ul>}
        {!connection.cards.length && !connection.error && <p className="muted">No credit cards were returned for this connection.</p>}
      </section>)}
  </>;
}

export function CardDetail() {
  const { data, loading, disabled, disconnect } = useConnections();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [leaving, setLeaving] = useState(false);
  // Accept the route segment whether or not Next.js has already decoded it.
  const matches = (cardId: string) => cardId === id || encodeURIComponent(cardId) === id;
  const connection = data.connections.find((item) => item.cards.some((card) => matches(card.id)));
  const card = connection?.cards.find((item) => matches(item.id));

  async function confirmDisconnect() {
    if (!connection) return;
    setLeaving(true);
    const ok = await disconnect(connection.id);
    dialog.current?.close();
    if (ok) router.push("/cards"); else setLeaving(false);
  }

  if (loading || leaving) return <p className="muted" role="status">{leaving ? "Disconnecting…" : "Loading…"}</p>;
  if (!connection || !card) return <>
    <Link className="back" href="/cards">← Cards</Link>
    <h1 className="page-title">Card not found</h1>
    <p className="muted">It may have been disconnected, or the server restarted.</p>
  </>;

  return <>
    <Link className="back" href="/cards">← Cards</Link>
    <h1 className="page-title">{card.name}</h1>
    <p className="muted subtitle">{connection.institution}{card.mask ? ` · •••• ${card.mask}` : ""}</p>
    <section className="hero">
      <p className="label">Current balance</p>
      <p className="hero-amount">{money(card.balance, card.currency)}</p>
    </section>
    {connection.error && <p className="notice error" role="alert">{connection.error}{connection.fetchedAt ? " Showing previously fetched details." : ""}</p>}
    <dl className="details">
      <div><dt>Minimum payment</dt><dd>{money(card.minimumPayment, card.currency)}</dd></div>
      <div><dt>Payment due</dt><dd>{dueDate(card.dueDate)}</dd></div>
      <div><dt>Credit limit</dt><dd>{money(card.creditLimit, card.currency)}</dd></div>
      <div><dt>APR</dt><dd>{card.aprs.length ? <span className="apr-list">{card.aprs.map((apr, index) =>
        <span key={`${apr.type}-${index}`}>{apr.percentage.toLocaleString("en-US")}%<small>{apr.type.replaceAll("_", " ")}</small></span>)}</span> : "Not provided"}</dd></div>
      <div><dt>Last fetched</dt><dd>{connection.fetchedAt ? new Date(connection.fetchedAt).toLocaleString() : "Not yet"}</dd></div>
    </dl>
    <button className="danger-text" disabled={disabled} onClick={() => dialog.current?.showModal()}>Disconnect {connection.institution}</button>
    <dialog ref={dialog} aria-labelledby="disconnect-title">
      <h2 id="disconnect-title">Disconnect {connection.institution}?</h2>
      <p className="muted">This removes {connection.cards.length === 1 ? "this card" : `all ${connection.cards.length} cards from this institution`} from Snowball. You can connect again later.</p>
      <div className="actions">
        <button className="text-button" disabled={disabled} onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="danger" disabled={disabled} onClick={() => void confirmDisconnect()}>Disconnect</button>
      </div>
    </dialog>
  </>;
}
