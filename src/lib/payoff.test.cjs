const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sortByPayoff } = require("./payoff.ts");

function entry(id, balance, rates = [], institution = "Bank A") {
  return { institution, card: { id, name: id, balance, currency: "USD", mask: null, minimumPayment: null, dueDate: null,
    aprs: rates.map((percentage) => ({ percentage, type: "purchase_apr" })) } };
}
const ids = (entries) => entries.map(({ card }) => card.id);

test("switching methods orders all institutions by balance or highest reported APR", () => {
  const entries = [entry("large", 4000, [12, 29]), entry("small", 100, [20], "Bank B"), entry("medium", 900, [24])];
  assert.deepEqual(ids(sortByPayoff(entries, "snowball")), ["small", "medium", "large"]);
  assert.deepEqual(ids(sortByPayoff(entries, "avalanche")), ["large", "medium", "small"]);
  assert.deepEqual(ids(sortByPayoff(entries, "snowball")), ["small", "medium", "large"]);
});

test("missing and non-finite values sort last while zero and negative balances remain numeric", () => {
  const entries = [entry("missing", null), entry("zero", 0, [0]), entry("positive", 100, [10]),
    entry("invalid", NaN, [NaN, Infinity]), entry("credit", -10, [5])];
  assert.deepEqual(ids(sortByPayoff(entries, "snowball")), ["credit", "zero", "positive", "missing", "invalid"]);
  assert.deepEqual(ids(sortByPayoff(entries, "avalanche")), ["positive", "credit", "zero", "missing", "invalid"]);
});

test("ties preserve source order and sorting leaves source data intact", () => {
  const entries = [entry("first", 100, [20]), entry("second", 100, [20]), entry("third", 10, [30])];
  const original = structuredClone(entries);
  for (const item of entries) {
    item.card.aprs.forEach(Object.freeze);
    Object.freeze(item.card.aprs);
    Object.freeze(item.card);
    Object.freeze(item);
  }
  Object.freeze(entries);
  for (const method of ["snowball", "avalanche"]) {
    const result = sortByPayoff(entries, method);
    assert.deepEqual(ids(result), ["third", "first", "second"]);
    assert.notEqual(result, entries);
    assert.equal(result[0], entries[2]);
    assert.deepEqual(entries, original);
  }
});

test("empty and single-card lists work for both methods", () => {
  for (const method of ["snowball", "avalanche"]) {
    assert.deepEqual(sortByPayoff([], method), []);
    assert.deepEqual(ids(sortByPayoff([entry("only", null)], method)), ["only"]);
  }
});

test("balances sort by reported amount without currency conversion", () => {
  const entries = [entry("usd", 200), entry("eur", 100)];
  entries[1].card.currency = "EUR";
  assert.deepEqual(ids(sortByPayoff(entries, "snowball")), ["eur", "usd"]);
});
