import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { signOut } from "../(auth)/actions";

const providerNames: Record<string, string> = { email: "Email and password", google: "Google" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/account");
  const passwordUpdated = (await searchParams).password === "updated";
  const methods = user.providers.map((provider) => providerNames[provider] ?? provider).join(", ") || "—";
  return <section>
    <header className="page-head">
      <h1>Account</h1>
      <form action={signOut}><button className="secondary">Sign out</button></form>
    </header>
    {passwordUpdated && <p className="notice" role="status">Your password was updated.</p>}
    <dl className="details">
      <div><dt>Email</dt><dd>{user.email ?? "—"}</dd></div>
      <div><dt>Sign-in method</dt><dd>{methods}</dd></div>
    </dl>
    {user.providers.includes("email") && <Link className="secondary" href="/reset-password">Change password</Link>}
  </section>;
}
