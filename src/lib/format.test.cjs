const assert = require("node:assert/strict");
const { test } = require("node:test");
const { money, dueDate, dollars, monthLabel } = require("./format.ts");

test("money formats currency, missing values, and unknown or invalid currencies", () => {
  assert.equal(money(1234.5, "USD"), "$1,234.50");
  assert.equal(money(0, "USD"), "$0.00", "zero is preserved");
  assert.equal(money(null, "USD"), "Not provided");
  assert.equal(money(10, null), "10.00 (currency unknown)");
  assert.equal(money(10, "US"), "10.00 US");
});

test("due dates and month labels format calendar values without timezone drift", () => {
  assert.equal(dueDate("2026-12-03"), "Dec 3, 2026");
  assert.equal(dueDate("2027-01-01"), "Jan 1, 2027");
  assert.equal(dueDate(null), "Not provided");
  assert.equal(monthLabel("2027-11"), "November 2027");
  assert.equal(monthLabel("2027-01"), "January 2027");
});

test("dollars formats whole cents", () => {
  assert.equal(dollars(41250), "$412.50");
  assert.equal(dollars(1), "$0.01");
  assert.equal(dollars(0), "$0.00");
});
