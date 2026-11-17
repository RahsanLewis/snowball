const assert = require("node:assert/strict");
const { test } = require("node:test");
const { registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

let cookie;
globalThis.__payoffTestCookies = {
  get: () => cookie ? { value: cookie } : undefined,
  set: (_name, value) => { cookie = value; },
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") return { url: "data:text/javascript,export async function cookies(){return globalThis.__payoffTestCookies}", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(__dirname, "..", specifier.slice(2)) + ".ts").href, context);
    return nextResolve(specifier, context);
  },
});
const route = require("../app/api/payoff-plan/route.ts");
const { addMonths, monthKey } = require("./payoff-plan.ts");
const { getSession } = require("./session.ts");
hooks.deregister();

test("calculator API computes server-side, protects review, and isolates sessions", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "http://127.0.0.1:3000";
  t.after(() => { if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; delete globalThis.__payoffTestCookies; });
  const targetMonth = addMonths(monthKey(new Date()), 12);
  const input = { action: "preview", targetMonth };
  const request = (body = input, extra = {}) => new Request("http://127.0.0.1:3000/api/payoff-plan", { method: "POST", headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
  assert.deepEqual(await (await route.GET()).json(), { plan: null, stale: false, needsRecalculation: false });
  assert.equal((await route.POST(request(input, { origin: "https://foreign.example" }))).status, 403);
  assert.equal((await route.POST(request({ ...input, targetMonth: "2027-13" }))).status, 400);
  assert.equal(cookie, undefined);
  assert.equal((await route.POST(request(input, { "content-type": "text/plain" }))).status, 400);
  assert.equal((await route.POST(request())).status, 401);
  const session = await getSession(true);
  const firstCookie = cookie;
  const debt = { id: "card", name: "Test card", mask: "1234", balance: 1000, currency: "USD", creditLimit: 2000, minimumPayment: 25, aprs: [{ percentage: 0, type: "purchase_apr" }] };
  session.connections.set("bank", { id: "bank", institution: "Bank", accessToken: "synthetic-private-token", cards: [debt] });
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const preview = await response.json();
  assert.equal(preview.estimate.monthlyBudgetCents, 8334);
  assert.equal(preview.estimate.method, "avalanche");
  assert.equal(preview.estimate.targetMonth, targetMonth);
  for (const target of [monthKey(new Date()), addMonths(monthKey(new Date()), -1), addMonths(monthKey(new Date()), 1201), "", "November 2027", null]) {
    assert.equal((await route.POST(request({ ...input, targetMonth: target }))).status, 400);
  }
  assert.equal((await route.POST(request({ action: "preview", years: 1, months: 0 }))).status, 400);
  assert.equal((await route.POST(request({ ...input, action: "save", targetMonth: addMonths(targetMonth, 1), quote: preview.quote }))).status, 409);
  assert.equal(JSON.stringify(preview).includes("synthetic-private-token"), false);
  assert.equal(session.payoffPlan, undefined, "preview never saves a plan");
  for (const field of [{ method: "thaw" }, { monthlyBudgetCents: 1 }, { sourceFingerprint: "forged" }]) assert.equal((await route.POST(request({ ...input, ...field }))).status, 400);
  assert.equal((await route.POST(request({ ...input, action: "save", quote: "forged" }))).status, 409);
  const save = { ...input, action: "save", quote: preview.quote };
  assert.equal((await route.POST(request(save))).status, 200);
  const saved = await (await route.GET()).json();
  assert.deepEqual(saved.plan, preview.estimate);
  assert.equal(saved.stale, false);
  session.payoffPlan.startMonth = "2020-01";
  const oldEstimate = await (await route.GET()).json();
  assert.equal(oldEstimate.stale, true);
  assert.equal(oldEstimate.plan.targetMonth, saved.plan.targetMonth, "reading an older estimate never moves its target");
  session.payoffPlan.startMonth = saved.plan.startMonth;
  session.busy = true;
  assert.equal((await route.POST(request())).status, 409);
  session.busy = false;
  debt.balance = 1200;
  assert.equal((await (await route.GET()).json()).stale, true);
  assert.equal((await route.POST(request(save))).status, 409);
  assert.deepEqual(session.payoffPlan, saved.plan, "stale save preserves the existing plan");
  const updated = await (await route.POST(request())).json();
  assert.equal((await route.POST(request({ ...save, quote: updated.quote }))).status, 200);
  assert.equal((await (await route.GET()).json()).plan.targetMonth, saved.plan.targetMonth);
  debt.minimumPayment = null;
  assert.equal((await route.POST(request())).status, 400);
  assert.deepEqual(session.payoffPlan, updated.estimate);
  debt.minimumPayment = 25;
  cookie = undefined;
  assert.equal((await (await route.GET()).json()).plan, null);
  assert.equal((await route.POST(request())).status, 401);
  const other = await getSession(true);
  assert.notEqual(cookie, firstCookie);
  assert.equal(other.payoffPlan, undefined);
  assert.equal((await route.POST(request())).status, 400);
  cookie = firstCookie;
  assert.deepEqual((await (await route.GET()).json()).plan, updated.estimate);
  session.payoffPlan = { years: 2, months: 0, method: "snowball", monthlyBudgetCents: 1 };
  assert.deepEqual(await (await route.GET()).json(), { plan: null, stale: false, needsRecalculation: true });
  assert.equal(session.connections.get("bank").accessToken, "synthetic-private-token");
});
