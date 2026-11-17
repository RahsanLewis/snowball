"use client";

import { useEffect, useRef, useState } from "react";
import type { Connection, PayoffPlan } from "@/lib/types";
import { addMonths, monthKey, monthsUntilTarget } from "@/lib/payoff-plan";

const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
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
      <button type="button" className="year-arrow" aria-label="Previous year" disabled={disabled || displayYear <= firstYear} onClick={() => setYear(displayYear - 1)}><span aria-hidden="true">←</span></button>
      <label className="picker-year"><span className="picker-year-label">YEAR</span><select aria-label="Payoff year" value={displayYear} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <button type="button" className="year-arrow" aria-label="Next year" disabled={disabled || displayYear >= lastYear} onClick={() => setYear(displayYear + 1)}><span aria-hidden="true">→</span></button>
    </div>
    <div className="month-picker-grid">{options.map(({ name, key, available }) => <label key={key} className={`month-choice${value === key ? " is-selected" : ""}${!available ? " is-unavailable" : ""}`}>
      <input type="radio" name="payoff-month" value={key} checked={value === key} disabled={disabled || !available} tabIndex={key === tabKey ? 0 : -1} aria-label={`${name} ${displayYear}`} ref={(element) => { if (element) inputs.current.set(key, element); else inputs.current.delete(key); }} onChange={() => onChange(key)} onKeyDown={(event) => {
        const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 };
        if (event.key in offsets) { event.preventDefault(); move(key, offsets[event.key]); }
        if (event.key === "Enter") { event.preventDefault(); onChange(key); }
      }} />
      <span>{name.slice(0, 3)}<span className="month-choice-check" aria-hidden="true">{value === key ? "✓" : ""}</span></span>
    </label>)}</div>
    <div className="month-selection" id="month-selection" role="status" aria-live="polite"><span className="month-selection-icon" aria-hidden="true">↗</span><span>{duration !== null ? <><strong>{monthLabel(value)}</strong><span>{duration} {duration === 1 ? "month" : "months"} away</span></> : <><strong>Your debt-free goal</strong><span>Select a month to get started</span></>}</span></div>
  </fieldset>;
}

function Estimate({ plan }: { plan: PayoffPlan }) {
  return <>
    <p className="eyebrow">ESTIMATED MONTHLY PAYMENT</p><p className="plan-payment">{dollars(plan.monthlyBudgetCents)}</p>
    <dl className="plan-summary"><div><dt>Target payoff month</dt><dd>{monthLabel(plan.targetMonth)}</dd></div><div><dt>Estimated interest</dt><dd>{dollars(plan.interestCents)}</dd></div><div><dt>Estimated total paid</dt><dd>{dollars(plan.totalPaidCents)}</dd></div></dl>
    <p className="muted">Using Avalanche: cover each card’s minimum payment, then put the remaining money toward the highest APR. Keep the same monthly budget as cards are paid off; the final payment may be smaller.</p>
    {plan.estimatedPayoffMonth !== plan.targetMonth && <p className="notice">Reported minimums require a payment that clears your debt earlier, by {monthLabel(plan.estimatedPayoffMonth)}.</p>}
    <h3>First month’s estimated payments</h3><ol className="priority-list">{plan.initialPayments.map((payment) => <li key={`${payment.connectionId}:${payment.cardId}`}><strong>{payment.name}{payment.mask ? ` · •••• ${payment.mask}` : ""} — {dollars(payment.paymentCents)}</strong><span>{payment.institution} · {payment.apr}% APR</span></li>)}</ol>
    <details className="plan-assumptions"><summary>How this estimate works</summary><p>Calculated from card details available in {monthLabel(plan.startMonth)}, with the first payment one month later. Interest is estimated monthly at APR ÷ 12 and rounded to cents. Each card’s highest reported APR is applied to its entire balance.</p><p>Reported minimum payments are held constant and capped at the remaining balance plus interest. Actual minimums and daily interest may differ. The estimate assumes no new purchases, fees, or rate changes, and payments made every month. It does not schedule or make payments.</p></details>
  </>;
}

export function PayoffPlanPanel({ connections }: { connections: Connection[] }) {
  const [saved, setSaved] = useState<Saved>({ plan: null, stale: false, needsRecalculation: false });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [targetMonth, setTargetMonth] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    const current = ++revision.current;
    setLoading(true); setLoadError(false); setPreview(null);
    planRequest<Saved>().then((data) => { if (active && current === revision.current) setSaved(data); })
      .catch(() => { if (active && current === revision.current) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [connections]);
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

  return <section className="payoff-panel" aria-labelledby="payoff-title" aria-busy={loading || busy}>
    <div className="section-heading"><div><h2 id="payoff-title">Your payoff plan</h2><p className="muted">Choose your payoff month. We’ll calculate your monthly payment using Avalanche.</p></div>
      {!loading && !loadError && !editing && <button ref={trigger} className="primary" onClick={begin}>{saved.plan ? "Recalculate plan" : "Set up your payoff plan"}</button>}
    </div>
    {loading ? <p role="status">Loading your plan…</p> : loadError ? <p className="notice error" role="alert">Couldn’t load your plan. Reload this page to try again.</p> : editing ? <>
      <h3 ref={heading} tabIndex={-1}>{preview ? "Your estimated payoff plan" : "When would you like to be debt-free?"}</h3>
      {preview ? <><Estimate plan={preview.estimate} /><div className="actions plan-actions"><button className="text-button" disabled={busy} onClick={close}>Cancel</button><button className="secondary" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>Adjust payoff month</button><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save plan"}</button></div></> :
        <form onSubmit={(event) => { event.preventDefault(); if (!busy) void calculate(); }}>
          <p className="muted" id="timeframe-help">Choose a month and year, such as November 2027, to see the estimated monthly payment. Adjust the payoff month until the payment fits your budget.</p>
          <PayoffMonthPicker value={targetMonth} onChange={(value) => { setTargetMonth(value); setError(""); }} disabled={busy} />
          <div className="actions plan-actions"><button type="button" className="text-button" disabled={busy} onClick={close}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Calculating…" : "Calculate monthly payment"}</button></div>
        </form>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </> : saved.plan ? <>
      {saved.stale && <p className="notice" role="status">Card details or the calendar month have changed. This is your previously saved estimate. Recalculate to update it; your target month remains {monthLabel(saved.plan.targetMonth)}.</p>}
      <Estimate plan={saved.plan} />
    </> : <p className="muted">{saved.needsRecalculation ? "Your previous manually entered plan needs recalculation. Set up a calculated Avalanche plan to continue." : "Connect your cards, then choose when you want to be debt-free to calculate your plan."}</p>}
    {connections.some((connection) => connection.error) && <p className="notice">Some card details could not refresh. Calculations may use previously fetched balances, APRs, and minimum payments.</p>}
    <p className="plan-storage muted">Estimates only; actual payoff depends on card terms and payment timing. Saved only for this local session. Server restarts or losing the session cookie make your plan unavailable.</p>
  </section>;
}
