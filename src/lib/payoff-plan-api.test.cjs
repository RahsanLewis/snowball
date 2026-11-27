const assert = require("node:assert/strict");
const { test } = require("node:test");
const { registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { createTestDb, dbClientModule } = require("./test-db.cjs");

// The signed-in user is faked at the Supabase client; auth.ts, store.ts, and SQL run for real.
let user;
globalThis.__payoffTestAuth = { getClaims: async () => ({ data: user ? { claims: { sub: user } } : null, error: null }) };
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/db/client") return { url: dbClientModule, shortCircuit: true };
    if (specifier === "@/lib/supabase/server") return { url: "data:text/javascript,export async function createClient(){return {auth:globalThis.__payoffTestAuth}}", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(__dirname, "..", specifier.slice(2)) + ".ts").href, context);
    return nextResolve(specifier, context);
  },
});
const route = require("../app/api/payoff-plan/route.ts");
const { addMonths, monthKey } = require("./payoff-plan.ts");
const store = require("./store.ts");
hooks.deregister();

const userA = "00000000-0000-4000-8000-0000000000a1";
const userB = "00000000-0000-4000-8000-0000000000b1";

test("calculator API computes server-side, protects review, and isolates users", async (t) => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "http://127.0.0.1:3000";
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const testDb = await createTestDb();
  await testDb.addUser(userA);
  await testDb.addUser(userB);
  t.after(async () => { if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; delete globalThis.__payoffTestAuth; await testDb.close(); });
  const targetMonth = addMonths(monthKey(new Date()), 12);
  const input = { action: "preview", targetMonth };
  const request = (body = input, extra = {}) => new Request("http://127.0.0.1:3000/api/payoff-plan", { method: "POST", headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
  const debt = { id: "card", name: "Test card", mask: "1234", balance: 1000, currency: "USD", creditLimit: 2000, minimumPayment: 25, aprs: [{ percentage: 0, type: "purchase_apr" }] };
  const setDebt = (changes) => store.saveCards(userA, "bank", { cards: [{ ...debt, ...changes }], fetchedAt: "2026-11-27T12:00:00.000Z" });
  const signedOutGet = await route.GET();
  assert.equal(signedOutGet.status, 401);
  assert.equal(JSON.stringify(await signedOutGet.json()).includes("plan"), false);
  assert.equal((await route.POST(request(input, { origin: "https://foreign.example" }))).status, 403);
  assert.equal((await route.POST(request({ ...input, targetMonth: "2027-13" }))).status, 400);
  assert.equal((await route.POST(request(input, { "content-type": "text/plain" }))).status, 400);
  assert.equal((await route.POST(request())).status, 401);
  assert.equal((await route.POST(request({ ...input, action: "save", quote: "anything" }))).status, 401);
  user = userA;
  assert.deepEqual(await (await route.GET()).json(), { plan: null, stale: false, needsRecalculation: false }, "rejected and signed-out requests never write account data");
  assert.deepEqual(await store.listConnections(userA), []);
  await store.addConnection(userA, { id: "bank", institution: "Bank", accessToken: "synthetic-private-token" });
  await setDebt({});
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
  assert.equal(await store.getPayoffPlan(userA), null, "preview never saves a plan");
  for (const field of [{ method: "thaw" }, { monthlyBudgetCents: 1 }, { sourceFingerprint: "forged" }]) assert.equal((await route.POST(request({ ...input, ...field }))).status, 400);
  assert.equal((await route.POST(request({ ...input, action: "save", quote: "forged" }))).status, 409);
  const save = { ...input, action: "save", quote: preview.quote };
  assert.equal((await route.POST(request(save))).status, 200);
  const saved = await (await route.GET()).json();
  assert.deepEqual(saved.plan, preview.estimate);
  assert.equal(saved.stale, false);
  await store.savePayoffPlan(userA, { ...saved.plan, startMonth: "2020-01" });
  const oldEstimate = await (await route.GET()).json();
  assert.equal(oldEstimate.stale, true);
  assert.equal(oldEstimate.plan.targetMonth, saved.plan.targetMonth, "reading an older estimate never moves its target");
  await store.savePayoffPlan(userA, saved.plan);
  await store.withAccountLock(userA, async () => {
    assert.equal((await route.POST(request())).status, 409);
  });
  await setDebt({ balance: 1200 });
  assert.equal((await (await route.GET()).json()).stale, true);
  assert.equal((await route.POST(request(save))).status, 409);
  assert.deepEqual(await store.getPayoffPlan(userA), saved.plan, "stale save preserves the existing plan");
  const updated = await (await route.POST(request())).json();
  assert.equal((await route.POST(request({ ...save, quote: updated.quote }))).status, 200);
  assert.equal((await (await route.GET()).json()).plan.targetMonth, saved.plan.targetMonth);
  await setDebt({ balance: 1200, minimumPayment: null });
  assert.equal((await route.POST(request())).status, 400);
  assert.deepEqual(await store.getPayoffPlan(userA), updated.estimate);
  await setDebt({ balance: 1200 });
  user = undefined;
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.POST(request())).status, 401);
  user = userB;
  assert.deepEqual(await store.listConnections(userB), [], "another user never sees these cards");
  assert.equal(await store.getPayoffPlan(userB), null);
  assert.equal((await (await route.GET()).json()).plan, null, "another user never sees this plan");
  assert.equal((await route.POST(request())).status, 400);
  user = userA;
  assert.deepEqual((await (await route.GET()).json()).plan, updated.estimate, "signing back in returns the same user's data");
  await store.savePayoffPlan(userA, { years: 2, months: 0, method: "snowball", monthlyBudgetCents: 1 });
  assert.deepEqual(await (await route.GET()).json(), { plan: null, stale: false, needsRecalculation: true });
  assert.equal(await store.accessTokenFor(userA, "bank"), "synthetic-private-token");
});
