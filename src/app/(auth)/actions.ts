"use server";

import { redirect } from "next/navigation";
import { appUrl, authErrorMessage, safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; done?: string };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};
const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
// Supabase hashes passwords with bcrypt, which only uses the first 72 bytes.
const passwordProblem = (password: string) =>
  password.length < 8 ? "Use at least 8 characters."
    : Buffer.byteLength(password, "utf8") > 72 ? "Use a shorter password (72 bytes at most)." : "";

const unavailable = "Sign-in is unavailable right now. Please try again later.";

async function supabase() {
  try { return await createClient(); }
  catch { return null; }
}

export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").trim();
  const password = text(form, "password");
  if (!validEmail(email) || !password) return { error: "Enter your email and password." };
  const client = await supabase();
  if (!client) return { error: unavailable };
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage("sign-in", error) };
  redirect(safeNext(text(form, "next")));
}

export async function signUp(_state: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").trim();
  const password = text(form, "password");
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  const client = await supabase();
  if (!client) return { error: unavailable };
  const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: appUrl("/auth/callback?next=/") } });
  // An existing account gets the same reply, so sign-up can't be used to find out who has one.
  if (error && !["user_already_exists", "email_exists"].includes(error.code ?? "")) return { error: authErrorMessage("sign-up", error) };
  return { done: "Check your email for a link to confirm your account." };
}

export async function signInWithGoogle(form: FormData) {
  const next = safeNext(text(form, "next"));
  const client = await supabase();
  const { data, error } = client
    ? await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: appUrl(`/auth/callback?next=${encodeURIComponent(next)}`) } })
    : { data: null, error: true };
  if (error || !data?.url) redirect("/sign-in?error=google");
  redirect(data.url);
}

export async function requestPasswordReset(_state: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email").trim();
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  const client = await supabase();
  if (!client) return { error: unavailable };
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: appUrl("/auth/callback?next=/reset-password") });
  if (error && error.status === 429) return { error: authErrorMessage("reset", error) };
  // Same reply whether or not the account exists.
  return { done: "If an account exists for that email, we’ve sent a link to reset your password." };
}

export async function updatePassword(_state: FormState, form: FormData): Promise<FormState> {
  const password = text(form, "password");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== text(form, "confirm")) return { error: "The passwords don’t match." };
  const client = await supabase();
  if (!client) return { error: unavailable };
  const { error } = await client.auth.updateUser({ password });
  if (error) return { error: authErrorMessage("update", error) };
  redirect("/account?password=updated");
}

export async function signOut() {
  const client = await supabase();
  await client?.auth.signOut();
  redirect("/sign-in");
}
