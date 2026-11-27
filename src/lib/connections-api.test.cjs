const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { createTestDb, dbClientModule } = require("./test-db.cjs");

// Supabase and Plaid are faked at their module boundaries; routes, store, and SQL run for real.
let user;
globalThis.__connectionsTestAuth = { getClaims: async () => ({ data: user ? { claims: { sub: user } } : null, error: null }) };
const plaid = {
  removed: [],
  exchange: async () => ({ item_id: "item-1", access_token: "access-sandbox-synthetic-1" }),
  fetchCards: async () => ({ cards: [{ id: "card-1", name: "Test card", mask: "1234", balance: 500, creditLimit: 1000, currency: "USD", minimumPayment: 25, dueDate: "2026-12-15", aprs: [{ percentage: 19.9, type: "purchase_apr" }] }], fetchedAt: "2026-11-27T12:00:00.000Z" }),
  remove: async (token) => { plaid.removed.push(token); },
};
globalThis.__connectionsTestPlaid = {
  itemPublicTokenExchange: async () => ({ data: await plaid.exchange() }),
  itemRemove: async ({ access_token }) => plaid.remove(access_token),
  linkTokenCreate: async () => ({ data: { link_token: "link-sandbox-synthetic" } }),
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/db/client") return { url: dbClientModule, shortCircuit: true };
    if (specifier === "@/lib/supabase/server") return { url: "data:text/javascript,export async function createClient(){return {auth:globalThis.__connectionsTestAuth}}", shortCircuit: true };
    if (specifier === "@/lib/plaid") return { url: "data:text/javascript,export function plaid(){return globalThis.__connectionsTestPlaid} export function fetchCards(token){return globalThis.__connectionsTestCards(token)}", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(__dirname, "..", specifier.slice(2)) + ".ts").href, context);
    return nextResolve(specifier, context);
  },
});
globalThis.__connectionsTestCards = (token) => plaid.fetchCards(token);
const connections = require("../app/api/connections/route.ts");
const exchange = require("../app/api/plaid/exchange/route.ts");
hooks.deregister();

const origin = "http://127.0.0.1:3000";
const request = (url, method, body, extra = {}) => new Request(`${origin}${url}`, {
  method, headers: { origin, host: "127.0.0.1:3000", "content-type": "application/json", ...extra }, body: JSON.stringify(body),
});
const link = (institution = "Test Bank") => exchange.POST(request("/api/plaid/exchange", "POST", { publicToken: "public-sandbox-synthetic", institution }));
const list = async () => (await (await connections.GET()).json()).connections;
const users = Array.from({ length: 8 }, (_, index) => `00000000-0000-4000-8000-00000000000${index + 1}`);
let testDb;

before(async () => {
  process.env.APP_ORIGIN = origin;
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  testDb = await createTestDb();
  for (const id of users) await testDb.addUser(id);
});
after(async () => {
  await testDb.close();
  delete globalThis.__connectionsTestAuth; delete globalThis.__connectionsTestPlaid; delete globalThis.__connectionsTestCards;
});

test("linking a bank saves the connection and its cards to the signed-in person's account data", async () => {
  user = users[0];
  const response = await link();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.connections.length, 1);
  assert.equal(body.connections[0].id, "item-1");
  assert.equal(body.connections[0].institution, "Test Bank");
  assert.equal(body.connections[0].cards[0].balance, 500);
  assert.equal(body.connections[0].fetchedAt, "2026-11-27T12:00:00.000Z");
  assert.equal(body.connections[0].error, null);
  assert.deepEqual(await list(), body.connections, "reading back returns the saved connection");
  assert.equal(JSON.stringify(body).includes("access-sandbox"), false, "tokens never leave the server");
});

test("refresh updates every connection, and a failed one keeps its last cards with an error", async (t) => {
  user = users[1];
  let next = 1;
  plaid.exchange = async () => ({ item_id: `item-r${next}`, access_token: `access-sandbox-r${next++}` });
  t.after(() => { plaid.exchange = async () => ({ item_id: "item-1", access_token: "access-sandbox-synthetic-1" }); });
  await link("Bank A");
  await link("Bank B");
  const original = plaid.fetchCards;
  t.after(() => { plaid.fetchCards = original; });
  plaid.fetchCards = async (token) => {
    if (token === "access-sandbox-r2") throw new Error("institution down");
    return { cards: [{ ...(await original()).cards[0], balance: 750 }], fetchedAt: "2026-11-28T09:00:00.000Z" };
  };
  const response = await connections.POST(request("/api/connections", "POST", {}));
  assert.equal(response.status, 200);
  const [a, b] = (await response.json()).connections;
  assert.equal(a.cards[0].balance, 750);
  assert.equal(a.fetchedAt, "2026-11-28T09:00:00.000Z");
  assert.equal(a.error, null);
  assert.equal(b.cards[0].balance, 500, "the failed connection keeps its last known cards");
  assert.equal(b.fetchedAt, "2026-11-27T12:00:00.000Z");
  assert.equal(b.error, "We couldn’t reach your card details. Please try again.");
});

test("a connection whose token can no longer be decrypted says so on refresh", async (t) => {
  user = users[2];
  plaid.exchange = async () => ({ item_id: "item-k", access_token: "access-sandbox-k" });
  t.after(() => { plaid.exchange = async () => ({ item_id: "item-1", access_token: "access-sandbox-synthetic-1" }); });
  await link();
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  t.after(() => { process.env.TOKEN_ENCRYPTION_KEY = key; });
  const [connection] = (await (await connections.POST(request("/api/connections", "POST", {}))).json()).connections;
  assert.equal(connection.error, "This connection can’t be read anymore. Disconnect it, then connect again.");
});

test("disconnecting revokes the connection at Plaid, then removes it; other people can't touch it", async () => {
  user = users[3];
  plaid.exchange = async () => ({ item_id: "item-d", access_token: "access-sandbox-d" });
  await link();
  user = users[4];
  const foreign = await connections.DELETE(request("/api/connections", "DELETE", { id: "item-d" }));
  assert.equal(foreign.status, 404);
  assert.equal(plaid.removed.includes("access-sandbox-d"), false);
  user = users[3];
  assert.equal((await list()).length, 1, "the owner still has it");
  const response = await connections.DELETE(request("/api/connections", "DELETE", { id: "item-d" }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).connections, []);
  assert.equal(plaid.removed.at(-1), "access-sandbox-d", "revoked with the decrypted token");
  assert.deepEqual(await list(), []);
  assert.equal((await connections.DELETE(request("/api/connections", "DELETE", { id: "item-d" }))).status, 404);
});

test("if Plaid can't revoke a connection, it stays", async (t) => {
  user = users[5];
  plaid.exchange = async () => ({ item_id: "item-p", access_token: "access-sandbox-p" });
  await link();
  const original = plaid.remove;
  plaid.remove = async () => { throw new Error("plaid down"); };
  t.after(() => { plaid.remove = original; });
  assert.equal((await connections.DELETE(request("/api/connections", "DELETE", { id: "item-p" }))).status, 502);
  assert.equal((await list()).length, 1);
});

test("disconnecting a connection whose token can't be decrypted removes it with a warning", async (t) => {
  user = users[6];
  plaid.exchange = async () => ({ item_id: "item-u", access_token: "access-sandbox-u" });
  await link();
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  t.after(() => { process.env.TOKEN_ENCRYPTION_KEY = key; });
  const removedBefore = plaid.removed.length;
  const response = await connections.DELETE(request("/api/connections", "DELETE", { id: "item-u" }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.connections, []);
  assert.match(body.notice, /couldn’t be revoked at Plaid/);
  assert.equal(plaid.removed.length, removedBefore, "nothing could be sent to Plaid");
});

test("if saving a new connection fails, it is revoked at Plaid and nothing is saved", async () => {
  user = users[7];
  // item-1 already belongs to another person, so saving it again violates the unique Plaid Item id.
  plaid.exchange = async () => ({ item_id: "item-1", access_token: "access-sandbox-duplicate" });
  const response = await link();
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "We couldn’t save this connection. Please try again.");
  assert.equal(plaid.removed.at(-1), "access-sandbox-duplicate");
  assert.deepEqual(await list(), []);
  user = users[0];
  assert.equal((await list())[0].id, "item-1", "the original owner's connection is untouched");
});

test("account actions are refused while another is in progress", async () => {
  user = users[0];
  const store = require("./store.ts");
  await store.withAccountLock(users[0], async () => {
    for (const response of [
      await link(),
      await connections.POST(request("/api/connections", "POST", {})),
      await connections.DELETE(request("/api/connections", "DELETE", { id: "item-1" })),
    ]) {
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error, "Another account action is in progress. Please try again shortly.");
    }
  });
});

test("signed-out requests are refused and change nothing", async () => {
  user = undefined;
  assert.equal((await connections.GET()).status, 401);
  assert.equal((await link()).status, 401);
  assert.equal((await connections.POST(request("/api/connections", "POST", {}))).status, 401);
  assert.equal((await connections.DELETE(request("/api/connections", "DELETE", { id: "item-1" }))).status, 401);
  user = users[0];
  assert.equal((await list()).length, 1);
});
