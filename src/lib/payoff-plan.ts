import type { Connection, PayoffPlan, PlanPayment } from "./types";

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(start: string, months: number): string {
  const [year, month] = start.split("-").map(Number);
  return monthKey(new Date(Date.UTC(year, month - 1 + months, 1)));
}

// Use calendar months in UTC, matching stored plan dates and the simulation start.
export function monthsUntilTarget(target: unknown, now = new Date()): number | null {
  if (typeof target !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(target)) return null;
  const [year, month] = target.split("-").map(Number);
  const duration = (year - now.getUTCFullYear()) * 12 + month - now.getUTCMonth() - 1;
  return Number.isInteger(duration) && duration >= 1 && duration <= 1200 ? duration : null;
}

type Debt = Omit<PlanPayment, "paymentCents"> & { balanceCents: number; minimumCents: number };
const maxCents = 1_000_000_000_000;
const safeCents = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= maxCents;

function debtsForCalculation(connections: Connection[]): Debt[] {
  const debts: Debt[] = [];
  const issues: string[] = [];
  for (const connection of connections) {
    for (const card of connection.cards) {
      const label = `${card.name} (${connection.institution})`;
      if (card.balance === null || !Number.isFinite(card.balance)) { issues.push(`${label}: balance missing or invalid`); continue; }
      if (card.balance <= 0) continue;
      if (card.currency !== "USD") { issues.push(`${label}: a USD balance is required`); continue; }
      const balanceCents = Math.round(card.balance * 100);
      if (!safeCents(balanceCents) || balanceCents === 0) { issues.push(`${label}: balance is outside the supported range`); continue; }
      // Do not drop invalid APR categories and quietly use a lower rate.
      if (!card.aprs.length || card.aprs.some((apr) => !Number.isFinite(apr.percentage) || apr.percentage < 0 || apr.percentage > 1000)) {
        issues.push(`${label}: APR missing or invalid`); continue;
      }
      if (card.minimumPayment === null || !Number.isFinite(card.minimumPayment) || card.minimumPayment < 0 || !safeCents(Math.round(card.minimumPayment * 100))) {
        issues.push(`${label}: minimum payment missing or invalid`); continue;
      }
      debts.push({ connectionId: connection.id, cardId: card.id, name: card.name, mask: card.mask,
        institution: connection.institution, apr: Math.max(...card.aprs.map((apr) => apr.percentage)),
        balanceCents, minimumCents: Math.round(card.minimumPayment * 100) });
    }
    if (!connection.cards.length && connection.error) issues.push(`${connection.institution}: card details unavailable`);
  }
  if (issues.length) throw new Error(`A complete estimate needs more card information. ${issues.join("; ")}. Refresh card details and try again.`);
  if (!debts.length) throw new Error("Connect a card with a positive USD balance to calculate a payoff plan. There is no debt to model yet.");
  if (!safeCents(debts.reduce((sum, debt) => sum + debt.balanceCents, 0))) throw new Error("The combined balance is outside the supported calculation range.");
  // Stable sort: equal APRs keep institution/card order.
  return debts.sort((a, b) => b.apr - a.apr);
}

function simulate(debts: Debt[], budget: number, months: number) {
  const balances = debts.map((debt) => debt.balanceCents);
  let interestCents = 0;
  let totalPaidCents = 0;
  let initialPayments: PlanPayment[] = [];
  for (let month = 1; month <= months; month++) {
    for (let i = 0; i < debts.length; i++) {
      const interest = Math.round(balances[i] * debts[i].apr / 1200);
      balances[i] += interest;
      interestCents += interest;
      if (!safeCents(balances[i]) || !safeCents(interestCents)) return null;
    }
    const payments = balances.map((balance, i) => Math.min(balance, debts[i].minimumCents));
    const minimumTotal = payments.reduce((sum, payment) => sum + payment, 0);
    if (minimumTotal > budget) return null;
    let extra = budget - minimumTotal;
    for (let i = 0; i < debts.length; i++) {
      balances[i] -= payments[i];
      const allocation = Math.min(extra, balances[i]);
      balances[i] -= allocation;
      payments[i] += allocation;
      extra -= allocation;
    }
    totalPaidCents += payments.reduce((sum, payment) => sum + payment, 0);
    if (!safeCents(totalPaidCents)) return null;
    if (month === 1) initialPayments = debts.map(({ balanceCents: _balance, minimumCents: _minimum, ...debt }, i) => ({ ...debt, paymentCents: payments[i] }));
    if (balances.every((balance) => balance === 0)) return { interestCents, totalPaidCents, initialPayments, payoffMonths: month };
  }
  return null;
}

export function calculatePlan(connections: Connection[], duration: number, now = new Date()): Omit<PayoffPlan, "sourceFingerprint"> {
  if (!Number.isInteger(duration) || duration < 1 || duration > 1200) throw new Error("Choose a payoff timeframe from 1 month to 100 years.");
  const debts = debtsForCalculation(connections);
  let low = 0;
  // Paying every balance plus one month's interest is a guaranteed feasible upper bound.
  let high = debts.reduce((sum, debt) => sum + debt.balanceCents + Math.round(debt.balanceCents * debt.apr / 1200), 0);
  if (!safeCents(high)) throw new Error("The required payment is outside the supported calculation range.");
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (simulate(debts, middle, duration)) high = middle;
    else low = middle + 1;
  }
  const result = simulate(debts, low, duration);
  if (!result) throw new Error("Could not calculate a payoff plan within the supported range.");
  const startMonth = monthKey(now);
  return { version: 2, years: Math.floor(duration / 12), months: duration % 12, startMonth, targetMonth: addMonths(startMonth, duration),
    estimatedPayoffMonth: addMonths(startMonth, result.payoffMonths), monthlyBudgetCents: low,
    interestCents: result.interestCents, totalPaidCents: result.totalPaidCents,
    method: "avalanche", initialPayments: result.initialPayments };
}
