const assert = require("node:assert/strict");
const { test } = require("node:test");
const { registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

// Replace the Supabase client with a fake whose getClaims result each test controls.
globalThis.__authTestClaims = { data: null, error: null };
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase/server") return { url: "data:text/javascript,export async function createClient(){return {auth:{getClaims:async()=>globalThis.__authTestClaims}}}", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(__dirname, "..", specifier.slice(2)) + ".ts").href, context);
    return nextResolve(specifier, context);
  },
});
const { authErrorMessage, currentUser, requireUser, safeNext } = require("./auth.ts");
const { RequestError } = require("./http.ts");
hooks.deregister();

test("safeNext keeps same-app paths", () => {
  assert.equal(safeNext("/plan"), "/plan");
  assert.equal(safeNext("/cards/abc?x=1#top"), "/cards/abc?x=1#top");
  assert.equal(safeNext("/plan/../cards"), "/cards");
});

test("safeNext rejects anything that could leave the app", () => {
  for (const value of ["//evil.com", "/\\evil.com", "/.//evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "http:/evil.com", "javascript:alert(1)", "evil.com", "", " /plan", undefined, null, 42, ["/plan"], `/${"a".repeat(600)}`]) {
    assert.equal(safeNext(value), "/", JSON.stringify(value));
  }
  assert.equal(safeNext("//evil.com", "/reset-password"), "/reset-password");
});

test("auth errors never reveal raw provider text or whether an account exists", () => {
  for (const error of [{ code: "invalid_credentials", status: 400 }, { code: "email_not_confirmed", status: 400 }, { code: "user_not_found" }, null, { code: "unexpected" }]) {
    assert.equal(authErrorMessage("sign-in", error), "Email or password is incorrect.");
  }
  assert.match(authErrorMessage("sign-in", { status: 429 }), /Too many attempts/);
  assert.match(authErrorMessage("reset", { code: "over_email_send_rate_limit" }), /Too many attempts/);
  assert.match(authErrorMessage("sign-up", { code: "weak_password" }), /stronger password/);
  assert.match(authErrorMessage("update", { code: "weak_password" }), /stronger password/);
  assert.equal(authErrorMessage("sign-in", { code: "weak_password" }), "Email or password is incorrect.");
  assert.equal(authErrorMessage("sign-up", { code: "email_address_invalid", message: "secret detail" }), "Something went wrong. Please try again.");
  assert.match(authErrorMessage("google", null), /Google sign-in/);
});

test("currentUser and requireUser trust only verified claims", async (t) => {
  t.after(() => { delete globalThis.__authTestClaims; });
  globalThis.__authTestClaims = { data: null, error: null };
  assert.equal(await currentUser(), null);
  await assert.rejects(requireUser(), (error) => error instanceof RequestError && error.status === 401);

  globalThis.__authTestClaims = { data: { claims: { sub: "user-1" } }, error: { message: "invalid JWT" } };
  assert.equal(await currentUser(), null, "a verification error means signed out");
  globalThis.__authTestClaims = { data: { claims: { sub: "" } }, error: null };
  assert.equal(await currentUser(), null);

  globalThis.__authTestClaims = { data: { claims: { sub: "user-1", email: "a@example.com", app_metadata: { providers: ["email", "google", 7] } } }, error: null };
  assert.deepEqual(await requireUser(), { id: "user-1", email: "a@example.com", providers: ["email", "google"] });
  globalThis.__authTestClaims = { data: { claims: { sub: "user-2" } }, error: null };
  assert.deepEqual(await currentUser(), { id: "user-2", email: null, providers: [] });
});
