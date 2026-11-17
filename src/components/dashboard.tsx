"use client";

import Link from "next/link";
import { dueDate, money } from "@/lib/format";
import { dateKey, nextPaymentDue, totalOwed } from "@/lib/summary";
import { useConnections } from "./connections-provider";
import { InfoTip } from "./info-tip";
import { PlanSummary } from "./payoff-plan";

// Home: only what matters day to day. Details live on /cards, /plan, and /about.
export function Dashboard() {
  const { data, loading, disabled, connect } = useConnections();
  if (loading) return <p className="muted" role="status">Loading…</p>;
  if (!data.connections.length) return <section className="empty">
    <h1>All your card debt in one place.</h1>
    <p className="muted">Connect a credit card to see what you owe and plan your payoff.</p>
    <button className="primary" disabled={disabled} onClick={() => void connect()}>Connect credit card</button>
  </section>;

  const { totalUsd, included, count } = totalOwed(data.connections);
  const next = nextPaymentDue(data.connections, dateKey(new Date()));
  return <>
    <section className="hero">
      <h1 className="label">Total owed <InfoTip label="About this total">
        Combined USD balance from your last refresh{included < count ? `; ${count - included} of ${count} cards without a USD balance aren’t included` : ""}. <Link href="/about#data">About your data</Link>
      </InfoTip></h1>
      <p className="hero-amount">{included ? money(totalUsd, "USD") : "—"}</p>
    </section>
    {data.connections.some((connection) => connection.error) && <p className="notice">Some cards couldn’t refresh. <Link href="/cards">Review cards</Link></p>}
    <ul className="rows summary-grid">
      <li><PlanSummary connections={data.connections} /></li>
      <li>{next ? <Link className="row" href={`/cards/${encodeURIComponent(next.card.id)}`}>
        <span className="row-main"><span className="row-label">Next payment due</span><span className="row-title">{dueDate(next.card.dueDate)}</span><span className="muted">{money(next.card.minimumPayment, next.card.currency)} minimum · {next.card.name}</span></span>
        <span className="chev" aria-hidden="true">›</span>
      </Link> : <div className="row">
        <span className="row-main"><span className="row-label">Next payment due</span><span className="row-title muted">No upcoming due date</span></span>
      </div>}</li>
    </ul>
  </>;
}
