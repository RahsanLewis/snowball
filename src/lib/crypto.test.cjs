const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { test } = require("node:test");
const { decryptSecret, encryptionKey, encryptSecret } = require("./crypto.ts");

const key = randomBytes(32);
const token = "access-sandbox-synthetic-token";
const context = "user-1:item-1";

test("encrypted tokens round-trip and never contain the plaintext", () => {
  const sealed = encryptSecret(token, context, key);
  assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(sealed.includes(token), false);
  assert.equal(decryptSecret(sealed, context, key), token);
});

test("each encryption uses a fresh IV", () => {
  const first = encryptSecret(token, context, key);
  const second = encryptSecret(token, context, key);
  assert.notEqual(first, second);
  assert.notEqual(first.split(".")[1], second.split(".")[1]);
});

test("tampered values, wrong keys, and wrong contexts are rejected", () => {
  const sealed = encryptSecret(token, context, key);
  const flip = (index) => {
    const parts = sealed.split(".");
    const bytes = Buffer.from(parts[index], "base64url");
    bytes[0] ^= 1;
    parts[index] = bytes.toString("base64url");
    return parts.join(".");
  };
  for (const index of [1, 2, 3]) assert.throws(() => decryptSecret(flip(index), context, key), /could not be verified/);
  assert.throws(() => decryptSecret(sealed, context, randomBytes(32)), /could not be verified/);
  assert.throws(() => decryptSecret(sealed, "user-2:item-1", key), /could not be verified/, "a token moved to another user's row fails");
});

test("malformed encrypted values are rejected", () => {
  const [, iv, tag, body] = encryptSecret(token, context, key).split(".");
  for (const value of ["", "v1", `v2.${iv}.${tag}.${body}`, `v1.${iv}.${tag}`, `v1.${iv}.${tag}.${body}.extra`, `v1.AAAA.${tag}.${body}`, `v1.${iv}.AAAA.${body}`, `v1.${iv}.${tag}.`]) {
    assert.throws(() => decryptSecret(value, context, key), /Unsupported encrypted value/, JSON.stringify(value));
  }
});

test("the encryption key must be 32 bytes of canonical base64", () => {
  const raw = randomBytes(32).toString("base64");
  assert.equal(encryptionKey(raw).length, 32);
  assert.throws(() => encryptionKey(""), /is not set/);
  assert.throws(() => encryptionKey(undefined), /is not set/);
  for (const bad of [randomBytes(16).toString("base64"), randomBytes(33).toString("base64"), "not base64 at all!", `${raw}\n`]) {
    assert.throws(() => encryptionKey(bad), (error) => /32 random bytes/.test(error.message) && !error.message.includes(bad));
  }
});
