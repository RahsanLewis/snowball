const assert = require("node:assert/strict");
const { test } = require("node:test");
const { calculatePlan, addMonths, monthsUntilTarget } = require("./payoff-plan.ts");

const card = (id, balance, apr, limit) => ({ id, name: id, mask: null, balance, creditLimit: limit, currency: "USD", minimumPayment: 25, dueDate: null, aprs: apr === null ? [] : [{ percentage: apr, type: "purchase_apr" }] });
const connections = [{ id: "one", institution: "One", cards: [card("large", 4000, 25, 10000), card("small", 900, 15, 1000)] }, { id: "two", institution: "Two", cards: [card("middle", 2000, 30, 5000)] }];

const now = new Date("2026-11-16T12:00:00Z");
const model = (cards, duration = 12) => calculatePlan([{ id: "one", institution: "Bank", cards }], duration, now);
const order = (plan) => plan.initialPayments.map((payment) => payment.cardId);

test("Avalanche orders debts across institutions by highest APR without mutating source order", () => {
  assert.deepEqual(order(calculatePlan(connections, 12, now)), ["middle", "large", "small"]);
  assert.equal(connections[0].cards[0].id, "large", "does not mutate source order");
});

test("equal APRs preserve source order regardless of balance or credit limit", () => {
  const cards = [card("tie1", 100, 20, null), card("highest", 300, 30, 200), card("tie2", 50, 20, 100), card("tie3", 1000, 20, 0)];
  assert.deepEqual(order(model(cards)), ["highest", "tie1", "tie2", "tie3"]);
});

test("each card ranks by its highest APR; zero APR is valid", () => {
  const highest = card("highest", 100, 5, 1000);
  highest.aprs.push({ percentage: 29, type: "cash_apr" });
  const result = model([card("zeroAPR", 100, 0, 1000), highest]);
  assert.deepEqual(order(result), ["highest", "zeroAPR"]);
  assert.deepEqual(result.initialPayments.map((payment) => payment.apr), [29, 0]);
});

test("duration accepts whole months from 1 to 1200 and rejects anything else", () => {
  const debt = card("debt", 100, 10, 1000);
  for (const duration of [1, 12, 1200]) assert.equal(model([debt], duration).targetMonth, addMonths("2026-11", duration));
  for (const duration of [0, -1, 1.5, 1201, Infinity, NaN, "12"]) assert.throws(() => model([debt], duration), /timeframe/);
});

test("zero interest returns exact whole-cent payment and total, with a smaller final payment", () => {
  const result = model([{ ...card("zero", 1000, 0, 2000), minimumPayment: 0 }], 12);
  assert.equal(result.monthlyBudgetCents, 8334);
  assert.equal(result.totalPaidCents, 100000);
  assert.equal(result.interestCents, 0);
  assert.equal(result.targetMonth, "2027-11");
  assert.equal(result.estimatedPayoffMonth, "2027-11");
  assert.equal(result.method, "avalanche");
});

test("interest-bearing single-card result agrees with amortization and cent rounding", () => {
  const result = model([card("apr", 1000, 12, 2000)], 12);
  const analyticalCents = 100000 * 0.01 / (1 - Math.pow(1.01, -12));
  assert.ok(Math.abs(result.monthlyBudgetCents - analyticalCents) <= 1);
  assert.equal(result.totalPaidCents, 100000 + result.interestCents);
  assert.ok(result.interestCents > 0);
  // Independent one-card recurrence establishes both feasibility and cent-level minimality.
  const balanceAfter = (payment) => {
    let balance = 100000;
    for (let i = 0; i < 12; i++) balance = Math.max(0, balance + Math.round(balance * 0.01) - payment);
    return balance;
  };
  assert.equal(balanceAfter(result.monthlyBudgetCents), 0);
  assert.ok(balanceAfter(result.monthlyBudgetCents - 1) > 0);
});

test("Avalanche reserves other minimums, targets highest APR, and rolls freed money over", () => {
  const low = { ...card("low", 100, 0, 1000), minimumPayment: 10 };
  const high = { ...card("high", 100, 12, 1000), minimumPayment: 10 };
  const result = model([low, high], 2);
  assert.equal(result.monthlyBudgetCents, 10055);
  assert.deepEqual(result.initialPayments.map((p) => [p.cardId, p.paymentCents]), [["high", 9055], ["low", 1000]]);
  assert.equal(result.interestCents, 110);
  assert.equal(result.totalPaidCents, 20110);
  assert.equal(result.initialPayments.reduce((sum, p) => sum + p.paymentCents, 0), result.monthlyBudgetCents);
});

test("minimum floor can pay debt off before the target; minimums cap at remaining balance", () => {
  const result = model([ { ...card("floor", 100, 0, 2000), minimumPayment: 60 } ], 12);
  assert.equal(result.monthlyBudgetCents, 6000);
  assert.equal(result.estimatedPayoffMonth, "2027-01");
  assert.equal(result.totalPaidCents, 10000);
  const capped = model([{ ...card("cap", 5, 0, 100), minimumPayment: 25 }], 1);
  assert.equal(capped.monthlyBudgetCents, 500);
});

test("one-month plan covers each balance plus rounded interest using highest APR", () => {
  const debt = card("multi", 100, 12, 2000);
  debt.aprs.push({ percentage: 24, type: "cash_apr" });
  const result = model([debt], 1);
  assert.equal(result.monthlyBudgetCents, 10200);
  assert.equal(result.interestCents, 200);
  assert.equal(result.initialPayments[0].apr, 24);
});

test("complete estimates reject missing or invalid inputs rather than omit positive debt", () => {
  const good = card("good", 100, 20, 1000);
  for (const change of [{ balance: null }, { balance: NaN }, { currency: "EUR" }, { minimumPayment: null }, { minimumPayment: -1 }, { aprs: [] }, { aprs: [{ percentage: NaN }] }, { aprs: [{ percentage: -1 }] }, { aprs: [{ percentage: 1001 }] }, { balance: 1e15 }]) {
    assert.throws(() => model([good, { ...good, id: "bad", ...change }], 12));
  }
  assert.throws(() => calculatePlan([{ id: "x", institution: "Bank", cards: [], error: "failed" }], 12), /unavailable/);
  assert.throws(() => model([], 12), /no debt/);
  assert.throws(() => model([good], 0), /timeframe/);
  assert.equal(model([good, { ...good, balance: -10, aprs: [], minimumPayment: null }], 12).initialPayments.length, 1);
});

test("long horizons, tiny balances, and calendar year boundaries remain bounded", () => {
  assert.equal(model([{ ...card("tiny", 0.01, 0, 100), minimumPayment: 0 }], 1200).monthlyBudgetCents, 1);
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-11", 1200), "2126-11");
  const debt = card("long", 1000, 30, 2000);
  const short = model([debt], 12);
  const long = model([debt], 36);
  assert.ok(long.monthlyBudgetCents < short.monthlyBudgetCents);
  assert.ok(long.interestCents > short.interestCents);
});


test("target month validation handles year boundaries, UTC, and supported limits", () => {
  const date = new Date("2026-11-30T23:59:59Z");
  assert.equal(monthsUntilTarget("2027-11", date), 12);
  assert.equal(monthsUntilTarget("2026-12", date), 1);
  assert.equal(monthsUntilTarget("2027-01", date), 2);
  assert.equal(monthsUntilTarget("2126-11", date), 1200);
  for (const target of ["2026-11", "2026-10", "2126-12", "2027-00", "2027-13", "2027-1", "2027-01-01", "November 2027", " 2027-11", "", null, 202711]) assert.equal(monthsUntilTarget(target, date), null);
  const boundary = new Date("2026-12-31T23:30:00-05:00");
  assert.equal(monthsUntilTarget("2027-01", boundary), null);
  assert.equal(monthsUntilTarget("2027-02", boundary), 1);
  const duration = monthsUntilTarget("2027-11", date);
  assert.equal(calculatePlan(connections, duration, date).targetMonth, "2027-11");
});
