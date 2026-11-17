"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Connection, PayoffPlan } from "@/lib/types";
import { addMonths, monthKey, monthsUntilTarget } from "@/lib/payoff-plan";
import { dollars, monthLabel } from "@/lib/format";
import { useConnections } from "./connections-provider";
import { InfoTip } from "./info-tip";

type Saved = { plan: PayoffPlan | null; stale: boolean; needsRecalculation: boolean };
type Preview = { estimate: PayoffPlan; quote: string };

async function planRequest<T>(body?: unknown): Promise<T> {
  const response = await fetch("/api/payoff-plan", {
    method: body ? "POST" : "GET", cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Couldn’t calculate your plan. Please try again.");
  return data;
}

function PayoffMonthPicker({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  const currentMonth = monthKey(new Date());
  const earliest = addMonths(currentMonth, 1);
  const latest = addMonths(currentMonth, 1200);
  const firstYear = Number(earliest.slice(0, 4));
  const lastYear = Number(latest.slice(0, 4));
  const [year, setYear] = useState(Number((value || earliest).slice(0, 4)));
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const displayYear = Math.min(lastYear, Math.max(firstYear, year));
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const options = monthNames.map((name, index) => {
    const key = `${displayYear}-${String(index + 1).padStart(2, "0")}`;
    return { name, key, available: key >= earliest && key <= latest };
  });
  const tabKey = options.find((option) => option.key === value && option.available)?.key
    ?? options.find((option) => option.available)?.key;
  const duration = monthsUntilTarget(value);

  function move(key: string, offset: number) {
    const next = addMonths(key, offset);
    if (next < earliest || next > latest) return;
    setYear(Number(next.slice(0, 4)));
    onChange(next);
    requestAnimationFrame(() => inputs.current.get(next)?.focus());
  }

  return <fieldset className="month-picker" disabled={disabled} aria-describedby="timeframe-help month-selection">
    <legend>Payoff month</legend>
    <div className="month-picker-toolbar">
      <button type="button" className="year-arrow" aria-label="Previous year" disabled={disabled || displayYear <= firstYear} onClick={() => setYear(displayYear - 1)}><span aria-hidden="true">‹</span></button>
      <select className="picker-year" aria-label="Payoff year" value={displayYear} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map((option) => <option key={option} value={option}>{option}</option>)}</select>
      <button type="button" className="year-arrow" aria-label="Next year" disabled={disabled || displayYear >= lastYear} onClick={() => setYear(displayYear + 1)}><span aria-hidden="true">›</span></button>
    </div>
    <div className="month-picker-grid">{options.map(({ name, key, available }) => <label key={key} className={`month-choice${value === key ? " is-selected" : ""}${!available ? " is-unavailable" : ""}`}>
      <input type="radio" name="payoff-month" value={key} checked={value === key} disabled={disabled || !available} tabIndex={key === tabKey ? 0 : -1} aria-label={`${name} ${displayYear}`} ref={(element) => { if (element) inputs.current.set(key, element); else inputs.current.delete(key); }} onChange={() => onChange(key)} onKeyDown={(event) => {
        const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 };
        if (event.key in offsets) { event.preventDefault(); move(key, offsets[event.key]); }
        if (event.key === "Enter") { event.preventDefault(); onChange(key); }
      }} />
      <span>{name.slice(0, 3)}</span>
    </label>)}</div>
    <p className="month-selection" id="month-selection" role="status" aria-live="polite">{duration !== null
      ? <><strong>{monthLabel(value)}</strong> <span className="muted">· {duration} {duration === 1 ? "month" : "months"} away</span></>
      : <span className="muted">Select a month</span>}</p>
  </fieldset>;
}

function Estimate({ plan }: { plan: PayoffPlan }) {
  return <>
    <section className="hero">
      <p className="label">Monthly payment <InfoTip label="How this payment is calculated">
        Avalanche: every card gets its minimum, and the rest goes to the highest APR. An estimate, not a guarantee. <Link href="/about#estimates">How estimates work</Link>
      </InfoTip></p>
      <p className="hero-amount">{dollars(plan.monthlyBudgetCents)}<span className="per"> / month</span></p>
    </section>
    {plan.estimatedPayoffMonth !== plan.targetMonth && <p className="notice">Your minimum payments clear the debt earlier, by {monthLabel(plan.estimatedPayoffMonth)}.</p>}
    <dl className="details">
      <div><dt>Debt-free by</dt><dd>{monthLabel(plan.targetMonth)}</dd></div>
      <div><dt>Total interest</dt><dd>{dollars(plan.interestCents)}</dd></div>
      <div><dt>Total paid</dt><dd>{dollars(plan.totalPaidCents)}</dd></div>
    </dl>
    <h2 className="section-title">First month</h2>
    <ul className="rows">{plan.initialPayments.map((payment) => <li key={`${payment.connectionId}:${payment.cardId}`}><div className="row">
      <span className="row-main"><span className="row-title">{payment.name}</span><span className="muted">{payment.mask ? `•••• ${payment.mask} · ` : ""}{payment.apr}% APR</span></span>
      <span className="amount">{dollars(payment.paymentCents)}</span>
    </div></li>)}</ul>
  </>;
}

function useSavedPlan(connections: Connection[]) {
  const [saved, setSaved] = useState<Saved>({ plan: null, stale: false, needsRecalculation: false });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    const current = ++revision.current;
    setLoading(true); setLoadError(false);
    planRequest<Saved>().then((data) => { if (active && current === revision.current) setSaved(data); })
      .catch(() => { if (active && current === revision.current) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [connections]);
  return { saved, setSaved, loading, loadError, revision };
}

// Compact plan row for the home page.
export function PlanSummary({ connections }: { connections: Connection[] }) {
  const { saved, loading, loadError } = useSavedPlan(connections);
  const plan = saved.plan;
  return <Link className="row" href="/plan">
    <span className="row-main">
      <span className="row-label">Payoff plan</span>
      <span className={`row-title${plan ? "" : " muted"}`}>{loading ? "…" : loadError ? "Couldn’t load" : plan ? <>{dollars(plan.monthlyBudgetCents)}<span className="per"> / month</span></> : "Not set up"}</span>
      {plan && <span className="muted">Debt-free by {monthLabel(plan.targetMonth)}</span>}
    </span>
    {!loading && !loadError && (!plan || saved.stale) && <span className="row-side">
      {plan ? <span className="flag">Needs update</span> : <span className="link-text">Set up</span>}
    </span>}
    <span className="chev" aria-hidden="true">›</span>
  </Link>;
}

export function PayoffPlanPanel() {
  const { data, loading: connectionsLoading } = useConnections();
  const connections = data.connections;
  const { saved, setSaved, loading, loadError, revision } = useSavedPlan(connections);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [targetMonth, setTargetMonth] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hasCards = connections.length > 0;

  useEffect(() => { setPreview(null); }, [connections]);
  useEffect(() => { if (editing) heading.current?.focus(); }, [editing, preview]);

  function begin() {
    const plan = saved.plan;
    setTargetMonth(plan && monthsUntilTarget(plan.targetMonth) !== null
      ? plan.targetMonth : plan ? addMonths(monthKey(new Date()), 1) : "");
    setPreview(null); setError(""); setEditing(true);
  }
  function close() {
    setEditing(false); setPreview(null); setError("");
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function calculate() {
    if (monthsUntilTarget(targetMonth) === null) { setError("Choose a payoff month after the current month and within the next 100 years."); return; }
    setBusy(true); setError("");
    const current = revision.current;
    try {
      const result = await planRequest<Preview>({ action: "preview", targetMonth });
      if (current === revision.current) setPreview(result);
      else setError("Card details changed. Calculate again to use the latest details.");
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t calculate your plan."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview) return;
    setBusy(true); setError("");
    ++revision.current;
    try {
      const result = await planRequest<Saved>({ action: "save", targetMonth: preview.estimate.targetMonth, quote: preview.quote });
      setSaved(result); close();
    } catch (error) { setPreview(null); setError(error instanceof Error ? error.message : "Couldn’t save your plan."); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="payoff-title" aria-busy={loading || busy}>
    <header className="page-head">
      <h1 id="payoff-title">Payoff plan</h1>
      {!loading && !loadError && !editing && !connectionsLoading && hasCards && <button ref={trigger} className={saved.plan ? "secondary" : "primary"} onClick={begin}>{saved.plan ? "Recalculate" : "Set up plan"}</button>}
    </header>
    {loading || connectionsLoading ? <p className="muted" role="status">Loading…</p> : loadError ? <p className="notice error" role="alert">Couldn’t load your plan. Reload this page to try again.</p> : editing ? <>
      <h2 className="step-title" ref={heading} tabIndex={-1}>{preview ? "Review your plan" : "When do you want to be debt-free?"}</h2>
      {preview ? <><Estimate plan={preview.estimate} /><div className="actions plan-actions"><button className="text-button" disabled={busy} onClick={close}>Cancel</button><button className="secondary" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>Change month</button><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save plan"}</button></div></> :
        <form onSubmit={(event) => { event.preventDefault(); if (!busy) void calculate(); }}>
          <p className="muted" id="timeframe-help">Pick a month, then adjust until the payment fits your budget.</p>
          <PayoffMonthPicker value={targetMonth} onChange={(value) => { setTargetMonth(value); setError(""); }} disabled={busy} />
          <div className="actions plan-actions"><button type="button" className="text-button" disabled={busy} onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Calculating…" : "Calculate payment"}</button></div>
        </form>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </> : saved.plan ? <>
      {saved.stale && <p className="notice" role="status">Your card details or the month have changed since this plan was saved. Recalculate to update it.</p>}
      <Estimate plan={saved.plan} />
    </> : <div className="empty-inline">
      <p className="muted">{!hasCards ? "Connect a card to create a payoff plan." : saved.needsRecalculation ? "Your previous plan needs to be recalculated." : "Pick the month you want to be debt-free, and we’ll work out the monthly payment."}</p>
      {!hasCards && <Link className="secondary" href="/cards">Go to cards</Link>}
    </div>}
    {connections.some((connection) => connection.error) && <p className="notice">Some card details couldn’t refresh, so this plan may use earlier balances, APRs, and minimums.</p>}
  </section>;
}
