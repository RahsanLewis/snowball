import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/auth";
import { updatePassword } from "../actions";

// Reached from a password-reset email (via /auth/confirm) or from the account page; both need a session.
export default async function ResetPasswordPage() {
  if (!await currentUser()) redirect("/sign-in?next=/reset-password");
  return <section className="auth">
    <h1 className="page-title">Choose a new password</h1>
    <AuthForm action={updatePassword} submit="Save password" fields={[
      { name: "password", label: "New password (at least 8 characters)", type: "password", autoComplete: "new-password", minLength: 8 },
      { name: "confirm", label: "Confirm new password", type: "password", autoComplete: "new-password", minLength: 8 },
    ]} />
  </section>;
}
