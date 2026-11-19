import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  return <section className="auth">
    <h1 className="page-title">Reset your password</h1>
    <p className="muted subtitle">We’ll email you a link to choose a new one.</p>
    <AuthForm action={requestPasswordReset} submit="Send reset link" fields={[
      { name: "email", label: "Email", type: "email", autoComplete: "email" },
    ]} />
    <p className="auth-switch muted"><Link href="/sign-in">Back to sign in</Link></p>
  </section>;
}
