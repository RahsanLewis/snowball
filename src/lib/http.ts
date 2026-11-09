import "server-only";
import { NextResponse } from "next/server";

export class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function assertSameOrigin(request: Request) {
  const expected = new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3000");
  // Next.js normalizes loopback request URLs to localhost; Host retains the browser's address.
  if (request.headers.get("origin") !== expected.origin || request.headers.get("host") !== expected.host) {
    throw new RequestError("Open the app using its configured local address and try again.", 403);
  }
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new RequestError("Expected a JSON request.");
  }
  const raw = await request.text();
  if (raw.length > 4096) throw new RequestError("Request is too large.", 413);
  try {
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new RequestError("Invalid request."); }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorMessage(error: unknown): string {
  const code = (error as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
  if (code === "PRODUCT_NOT_READY") return "Your institution is still preparing card details. Try refreshing shortly.";
  if (code === "ITEM_LOGIN_REQUIRED") return "This connection needs attention. Disconnect it and connect again.";
  if (code === "INVALID_CREDENTIALS" || (error instanceof Error && error.message === "PLAID_NOT_CONFIGURED")) {
    return "Add your Plaid client ID and Sandbox secret to .env.local, then restart the app.";
  }
  return "We couldn’t reach your card details. Please try again.";
}

export function failure(error: unknown) {
  if (error instanceof RequestError) return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === "SESSION_BUSY") {
    return json({ error: "Another account action is in progress. Please try again shortly." }, 409);
  }
  return json({ error: errorMessage(error) }, 502);
}
