import Link from "next/link";
import { AuthForm, GoogleButton } from "@/components/auth-form";
import { safeNext } from "@/lib/auth";
import { signIn, signInWithGoogle } from "../actions";

const linkErrors: Record<string, string> = {
  link: "That link is invalid or has expired. Please try again.",
  google: "Google sign-in didn’t complete. Please try again.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const error = typeof params.error === "string" ? linkErrors[params.error] : undefined;
  return <section className="auth">
    <h1 className="page-title">Sign in</h1>
    {error && <p className="notice error" role="alert">{error}</p>}
    <GoogleButton action={signInWithGoogle} next={next} />
    <p className="divider"><span>or</span></p>
    <AuthForm action={signIn} submit="Sign in" hidden={{ next }} fields={[
      { name: "email", label: "Email", type: "email", autoComplete: "email" },
      { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
    ]} footer={<Link className="text-link" href="/forgot-password">Forgot password?</Link>} />
    <p className="auth-switch muted">New to Snowball? <Link href={`/sign-up${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`}>Create an account</Link></p>
  </section>;
}
