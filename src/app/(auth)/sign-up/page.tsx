import Link from "next/link";
import { AuthForm, GoogleButton } from "@/components/auth-form";
import { safeNext } from "@/lib/auth";
import { signInWithGoogle, signUp } from "../actions";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  return <section className="auth">
    <h1 className="page-title">Create your account</h1>
    <GoogleButton action={signInWithGoogle} next={next} />
    <p className="divider"><span>or</span></p>
    <AuthForm action={signUp} submit="Create account" fields={[
      { name: "email", label: "Email", type: "email", autoComplete: "email" },
      { name: "password", label: "Password (at least 8 characters)", type: "password", autoComplete: "new-password", minLength: 8 },
    ]} />
    <p className="auth-switch muted">Already have an account? <Link href="/sign-in">Sign in</Link></p>
  </section>;
}
