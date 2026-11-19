import "server-only";
import { RequestError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export type User = { id: string; email: string | null; providers: string[] };

// getClaims verifies the access token's signature, unlike getSession, which trusts the cookie.
export async function currentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string" || !claims.sub) return null;
  const providers = (claims.app_metadata as { providers?: unknown } | undefined)?.providers;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    providers: Array.isArray(providers) ? providers.filter((item): item is string => typeof item === "string") : [],
  };
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new RequestError("Sign in to continue.", 401);
  return user;
}

export function appUrl(path: string): string {
  return new URL(path, process.env.APP_ORIGIN ?? "http://127.0.0.1:3000").href;
}

// Only same-app paths are allowed as post-sign-in destinations, never another site.
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 512 || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  const base = "http://snowball.invalid";
  let url: URL;
  try { url = new URL(value, base); } catch { return fallback; }
  const path = `${url.pathname}${url.search}${url.hash}`;
  // "//host" would be read by browsers as another site, even after normalization (e.g. "/.//host").
  return url.origin === base && !path.startsWith("//") ? path : fallback;
}

type AuthAction = "sign-in" | "sign-up" | "reset" | "update" | "google";

// Never show Supabase's raw text, and never reveal whether an account exists.
export function authErrorMessage(action: AuthAction, error: { code?: string; status?: number } | null | undefined): string {
  const code = error?.code ?? "";
  if (error?.status === 429 || code.startsWith("over_") || code.endsWith("rate_limit")) return "Too many attempts. Please wait a few minutes and try again.";
  if (code === "weak_password" && (action === "sign-up" || action === "update")) return "Choose a stronger password: at least 8 characters and not a common one.";
  if (action === "sign-in") return "Email or password is incorrect.";
  if (action === "google") return "Google sign-in didn’t complete. Please try again.";
  return "Something went wrong. Please try again.";
}
