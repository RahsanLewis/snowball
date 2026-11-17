const assert = require("node:assert/strict");
const { test } = require("node:test");
const { budgetCents, validTimeframe, calculatePlan, addMonths, monthsUntilTarget, prioritizeDebts } = require("./payoff-plan.ts");

const card = (id, balance, apr, limit) => ({ id, name: id, mask: null, balance, creditLimit: limit, currency: "USD", minimumPayment: 25, dueDate: null, aprs: apr === null ? [] : [{ percentage: apr, type: "purchase_apr" }] });
const connections = [{ id: "one", institution: "One", cards: [card("large", 4000, 25, 10000), card("small", 900, 15, 1000)] }, { id: "two", institution: "Two", cards: [card("middle", 2000, 30, 5000)] }];

test("Avalanche orders debts across institutions by highest APR without mutating source order", () => {
  const ranked = prioritizeDebts(connections).ranked.map(({ card }) => card.id);
  assert.deepEqual(ranked, ["middle", "large", "small"]);
  assert.equal(connections[0].cards[0].id, "large", "does not mutate source order");
});

test("equal APRs preserve source order regardless of balance or credit limit", () => {
  const cards = [card("tie1", 100, 20, null), card("highest", 300, 30, 200), card("tie2", 50, 20, 100), card("tie3", 1000, 20, 0)];
  const result = prioritizeDebts([{ ...connections[0], cards }]);
  assert.deepEqual(result.ranked.map(({ card }) => card.id), ["highest", "tie1", "tie2", "tie3"]);
  assert.equal(result.unranked.length, 0);
});

test("unknown values never silently rank as zero; zero APR is valid", () => {
  const highest = card("highest", 100, 5, 1000);
  highest.aprs.push({ percentage: 29, type: "cash_apr" });
  const cards = [card("zeroAPR", 100, 0, 1000), highest, card("noAPR", 100, null, 1000), ...[null, 0, -50, Infinity, NaN].map((balance, i) => card(`balance${i}`, balance, 10, 1000)), { ...card("foreign", 100, 10, 1000), currency: "EUR" }];
  const result = prioritizeDebts([{ ...connections[0], cards }]);
  assert.deepEqual(result.ranked.map(({ card }) => card.id), ["highest", "zeroAPR"]);
  assert.equal(result.unranked.length, 7);
  assert.deepEqual(prioritizeDebts([]), { ranked: [], unranked: [] });
});

test("timeframe accepts whole years and months within the disclosed range", () => {
  for (const [y, m] of [[0, 1], [1, 0], [99, 11], [100, 0]]) assert.equal(validTimeframe(y, m), true);
  for (const [y, m] of [[0, 0], [-1, 2], [1.5, 0], [1, 12], [100, 1], [Infinity, 0], ["1", 0], [0, NaN]]) assert.equal(validTimeframe(y, m), false);
});

test("budget parsing preserves cents and rejects invalid or excessive amounts", () => {
  for (const [input, expected] of [["0.01", 1], ["500", 50000], ["123.45", 12345], ["1.1", 110], ["1000000", 100000000]]) assert.equal(budgetCents(input), expected);
  for (const input of ["", "0", "-1", "1e3", "NaN", "1.001", "1000000.01", "1,000", " 1", "999999999999999999999"]) assert.equal(budgetCents(input), null);
});

const now = new Date("2026-11-16T12:00:00Z");
const model = (cards, years = 0, months = 12) => calculatePlan([{ id: "one", institution: "Bank", cards }], years, months, now);

test("zero interest returns exact whole-cent payment and total, with a smaller final payment", () => {
  const result = model([{ ...card("zero", 1000, 0, 2000), minimumPayment: 0 }], 1, 0);
  assert.equal(result.monthlyBudgetCents, 8334);
  assert.equal(result.totalPaidCents, 100000);
  assert.equal(result.interestCents, 0);
  assert.equal(result.targetMonth, "2027-11");
  assert.equal(result.estimatedPayoffMonth, "2027-11");
  assert.equal(result.method, "avalanche");
});

test("interest-bearing single-card result agrees with amortization and cent rounding", () => {
  const result = model([card("apr", 1000, 12, 2000)], 1, 0);
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
  const result = model([low, high], 0, 2);
  assert.equal(result.monthlyBudgetCents, 10055);
  assert.deepEqual(result.initialPayments.map((p) => [p.cardId, p.paymentCents]), [["high", 9055], ["low", 1000]]);
  assert.equal(result.interestCents, 110);
  assert.equal(result.totalPaidCents, 20110);
  assert.equal(result.initialPayments.reduce((sum, p) => sum + p.paymentCents, 0), result.monthlyBudgetCents);
});

test("minimum floor can pay debt off before the target; minimums cap at remaining balance", () => {
  const result = model([ { ...card("floor", 100, 0, 2000), minimumPayment: 60 } ], 1, 0);
  assert.equal(result.monthlyBudgetCents, 6000);
  assert.equal(result.estimatedPayoffMonth, "2027-01");
  assert.equal(result.totalPaidCents, 10000);
  const capped = model([{ ...card("cap", 5, 0, 100), minimumPayment: 25 }], 0, 1);
  assert.equal(capped.monthlyBudgetCents, 500);
});

test("one-month plan covers each balance plus rounded interest using highest APR", () => {
  const debt = card("multi", 100, 12, 2000);
  debt.aprs.push({ percentage: 24, type: "cash_apr" });
  const result = model([debt], 0, 1);
  assert.equal(result.monthlyBudgetCents, 10200);
  assert.equal(result.interestCents, 200);
  assert.equal(result.initialPayments[0].apr, 24);
});

test("complete estimates reject missing or invalid inputs rather than omit positive debt", () => {
  const good = card("good", 100, 20, 1000);
  for (const change of [{ balance: null }, { balance: NaN }, { currency: "EUR" }, { minimumPayment: null }, { minimumPayment: -1 }, { aprs: [] }, { aprs: [{ percentage: NaN }] }, { aprs: [{ percentage: -1 }] }, { aprs: [{ percentage: 1001 }] }, { balance: 1e15 }]) {
    assert.throws(() => model([good, { ...good, id: "bad", ...change }], 0, 12));
  }
  assert.throws(() => calculatePlan([{ id: "x", institution: "Bank", cards: [], error: "failed" }], 1, 0), /unavailable/);
  assert.throws(() => model([], 1, 0), /no debt/);
  assert.throws(() => model([good], 0, 0), /timeframe/);
  assert.equal(model([good, { ...good, balance: -10, aprs: [], minimumPayment: null }], 1, 0).initialPayments.length, 1);
});

test("long horizons, tiny balances, and calendar year boundaries remain bounded", () => {
  assert.equal(model([{ ...card("tiny", 0.01, 0, 100), minimumPayment: 0 }], 100, 0).monthlyBudgetCents, 1);
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-11", 1200), "2126-11");
  const debt = card("long", 1000, 30, 2000);
  const short = model([debt], 1, 0);
  const long = model([debt], 3, 0);
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
  assert.equal(calculatePlan(connections, Math.floor(duration / 12), duration % 12, date).targetMonth, "2027-11");
});
