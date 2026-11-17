const assert = require("node:assert/strict");
const { test } = require("node:test");
const { totalOwed, nextPaymentDue, dateKey } = require("./summary.ts");

const card = (id, balance, dueDate, currency = "USD") => ({ id, name: id, mask: null, balance, creditLimit: null, currency, minimumPayment: 25, dueDate, aprs: [] });
const connection = (id, cards) => ({ id, institution: id, cards, fetchedAt: null, error: null });

test("total owed sums known USD balances and counts excluded cards", () => {
  const result = totalOwed([connection("a", [card("usd1", 100.5, null), card("unknown", null, null)]), connection("b", [card("eur", 50, null, "EUR"), card("usd2", 200, null)])]);
  assert.deepEqual(result, { totalUsd: 300.5, included: 2, count: 4 });
  assert.deepEqual(totalOwed([]), { totalUsd: 0, included: 0, count: 0 });
});

test("next payment picks the soonest upcoming due date across institutions", () => {
  const connections = [
    connection("a", [card("later", 100, "2026-12-10"), card("past", 100, "2026-11-10"), card("zero", 0, "2026-11-18")]),
    connection("b", [card("credit", -5, "2026-11-18"), card("none", 100, null), card("unknown", null, "2026-11-18"), card("soonest", 50, "2026-11-20"), card("malformed", 50, "11/19/2026")]),
  ];
  assert.equal(nextPaymentDue(connections, "2026-11-17").card.id, "soonest");
  assert.equal(nextPaymentDue(connections, "2026-11-17").connection.id, "b");
});

test("a payment due today counts, ties keep source order, and nothing due returns null", () => {
  assert.equal(nextPaymentDue([connection("a", [card("today", 10, "2026-11-17")])], "2026-11-17").card.id, "today");
  const tie = [connection("a", [card("first", 10, "2026-12-01")]), connection("b", [card("second", 10, "2026-12-01")])];
  assert.equal(nextPaymentDue(tie, "2026-11-17").card.id, "first");
  assert.equal(nextPaymentDue([connection("a", [card("past", 10, "2026-11-16")])], "2026-11-17"), null);
  assert.equal(nextPaymentDue([], "2026-11-17"), null);
  assert.equal(nextPaymentDue([connection("a", [card("next-year", 10, "2027-01-02")])], "2026-12-31").card.id, "next-year");
});

test("date key uses the local calendar date with zero padding", () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(dateKey(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
});
