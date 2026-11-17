import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts Plaid access tokens before they reach the database. The key lives only in the
// app's environment, so a database leak alone does not expose usable tokens.
// Format: v1.<iv>.<auth tag>.<ciphertext>, each part base64url.
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptionKey(raw = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as base64.");
  }
  return key;
}

// `context` (e.g. "<user id>:<item id>") is authenticated but not stored, so a ciphertext
// copied to another user's row fails to decrypt.
export function encryptSecret(plaintext: string, context: string, key = encryptionKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((part) => typeof part === "string" ? part : part.toString("base64url")).join(".");
}

export function decryptSecret(payload: string, context: string, key = encryptionKey()): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Unsupported encrypted value.");
  const [iv, tag, ciphertext] = parts.slice(1).map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !ciphertext.length) throw new Error("Unsupported encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"); }
  catch { throw new Error("Encrypted value could not be verified."); }
}
