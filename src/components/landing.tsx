import Link from "next/link";

// Signed-out home: what Snowball does, and the two ways in.
export function Landing() {
  return <section className="empty">
    <h1>All your card debt in one place.</h1>
    <p className="muted">See what you owe across your credit cards and get a plan to pay it off.</p>
    <div className="actions center">
      <Link className="primary" href="/sign-up">Create account</Link>
      <Link className="secondary" href="/sign-in">Sign in</Link>
    </div>
  </section>;
}
