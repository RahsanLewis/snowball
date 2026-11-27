const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { createTestDb, dbClientModule } = require("./test-db.cjs");

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/db/client") return { url: dbClientModule, shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(__dirname, "..", specifier.slice(2)) + ".ts").href, context);
    return nextResolve(specifier, context);
  },
});
const store = require("./store.ts");
hooks.deregister();

process.env.TOKEN_ENCRYPTION_KEY = require("node:crypto").randomBytes(32).toString("base64");
const userA = "00000000-0000-4000-8000-00000000000a";
const userB = "00000000-0000-4000-8000-00000000000b";
let testDb;

before(async () => {
  testDb = await createTestDb();
  await testDb.addUser(userA);
  await testDb.addUser(userB);
});
after(() => testDb.close());

test("a second account action is refused while the first runs, and allowed after", async () => {
  await store.withAccountLock(userA, async () => {
    await assert.rejects(store.withAccountLock(userA, async () => "overlap"), /ACCOUNT_BUSY/);
    assert.equal(await store.withAccountLock(userB, async () => "other user"), "other user", "another account is unaffected");
  });
  assert.equal(await store.withAccountLock(userA, async () => "next"), "next");
});

test("an expired lock can be taken over, and its old holder can't release the new one", async () => {
  let started, finishNew, newHolder;
  const newLockHeld = new Promise((resolve) => { started = resolve; });
  // This action began two minutes ago, so its 90-second lock has already run out.
  await store.withAccountLock(userA, async () => {
    newHolder = store.withAccountLock(userA, () => { started(); return new Promise((resolve) => { finishNew = resolve; }); });
    await Promise.race([newLockHeld, newHolder]);
  }, new Date(Date.now() - 120_000));
  // The old action has finished and tried to release; the new lock must still hold.
  await assert.rejects(store.withAccountLock(userA, async () => "overlap"), /ACCOUNT_BUSY/);
  finishNew();
  await newHolder;
  assert.equal(await store.withAccountLock(userA, async () => "free"), "free");
});

test("access tokens are stored encrypted and readable only through their owner's connection", async () => {
  const token = "access-sandbox-synthetic-a";
  await store.addConnection(userA, { id: "item-a", institution: "Test Bank", accessToken: token });
  // Deliberate side-channel check: encryption at rest is only visible in the raw row.
  const { rows } = await testDb.client.query("select access_token_ciphertext from plaid_items where plaid_item_id = $1", ["item-a"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].access_token_ciphertext.includes(token), false);
  assert.equal(await store.accessTokenFor(userA, "item-a"), token);
  assert.equal(await store.accessTokenFor(userB, "item-a"), null, "another user can't reach it");
});

test("the lock is released when the action fails", async () => {
  await assert.rejects(store.withAccountLock(userA, async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await store.withAccountLock(userA, async () => "free"), "free");
});
