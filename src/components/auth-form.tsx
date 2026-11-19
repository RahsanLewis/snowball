"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/(auth)/actions";

type Action = (state: FormState, form: FormData) => Promise<FormState>;
type Field = { name: string; label: string; type: "email" | "password"; autoComplete: string; minLength?: number };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="primary wide" disabled={pending}>{pending ? "One moment…" : label}</button>;
}

// One layout for every sign-in form. Errors come from the server, already safe to show.
export function AuthForm({ action, fields, submit, hidden = {}, footer }: {
  action: Action; fields: Field[]; submit: string; hidden?: Record<string, string>; footer?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  if (state.done) return <p className="notice" role="status">{state.done}</p>;
  return <form className="auth-form" action={formAction}>
    {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {fields.map((field) => <label key={field.name} className="field">
      <span>{field.label}</span>
      <input name={field.name} type={field.type} autoComplete={field.autoComplete} minLength={field.minLength} required />
    </label>)}
    {state.error && <p className="notice error" role="alert">{state.error}</p>}
    <Submit label={submit} />
    {footer}
  </form>;
}

export function GoogleButton({ action, next }: { action: (form: FormData) => Promise<void>; next: string }) {
  return <form action={action}>
    <input type="hidden" name="next" value={next} />
    <GoogleSubmit />
  </form>;
}

function GoogleSubmit() {
  const { pending } = useFormStatus();
  return <button className="secondary wide" disabled={pending}>{pending ? "Opening Google…" : "Continue with Google"}</button>;
}
