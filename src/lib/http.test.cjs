const assert = require("node:assert/strict");
const { registerHooks } = require("node:module");
const { test } = require("node:test");
const { NextRequest } = require("next/server");

// Resolve Next's extensionless import outside its bundler. Node transforms TS in memory.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "next/server" ? "next/server.js" : specifier, context);
  },
});
const { assertSameOrigin, RequestError } = require("./http.ts");
hooks.deregister();

test("configured origin and host validation", async (t) => {
  const previous = process.env.APP_ORIGIN;
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  delete process.env.APP_ORIGIN;

  function request(headers = {}) {
    return new NextRequest("http://127.0.0.1:3000/api/plaid/link-token", {
      method: "POST",
      headers,
    });
  }

  await t.test("accepts loopback headers despite Next.js URL normalization", () => {
    const req = request({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" });
    assert.equal(new URL(req.url).hostname, "localhost");
    assert.doesNotThrow(() => assertSameOrigin(req));
  });

  const rejected = [
    ["foreign origin", { origin: "https://example.com", host: "127.0.0.1:3000" }],
    ["different origin hostname", { origin: "http://localhost:3000", host: "127.0.0.1:3000" }],
    ["different origin port", { origin: "http://127.0.0.1:3001", host: "127.0.0.1:3000" }],
    ["different origin scheme", { origin: "https://127.0.0.1:3000", host: "127.0.0.1:3000" }],
    ["foreign host", { origin: "http://127.0.0.1:3000", host: "example.com" }],
    ["different host port", { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3001" }],
    ["missing origin", { host: "127.0.0.1:3000" }],
    ["null origin", { origin: "null", host: "127.0.0.1:3000" }],
    ["missing host", { origin: "http://127.0.0.1:3000" }],
    ["forwarded host cannot replace host", { origin: "http://127.0.0.1:3000", host: "example.com", "x-forwarded-host": "127.0.0.1:3000" }],
  ];
  for (const [name, headers] of rejected) {
    await t.test(`rejects ${name}`, () => {
      assert.throws(() => assertSameOrigin(request(headers)), (error) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.status, 403);
        return true;
      });
    });
  }

  await t.test("honors a configured origin instead of the default", () => {
    process.env.APP_ORIGIN = "http://127.0.0.1:4000";
    const req = new NextRequest("http://127.0.0.1:4000/api/connections", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:4000", host: "127.0.0.1:4000" },
    });
    assert.doesNotThrow(() => assertSameOrigin(req));
    assert.throws(() => assertSameOrigin(request({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" })), RequestError);
  });
});
