"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [{ href: "/", label: "Overview" }, { href: "/cards", label: "Cards" }, { href: "/plan", label: "Plan" }];

export function AppHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const current = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return <header className="topbar">
    <div className="topbar-inner">
      <Link className="brand" href="/">snowball</Link>
      <nav aria-label="Main">{signedIn && links.map(({ href, label }) =>
        <Link key={href} href={href} aria-current={current(href) ? "page" : undefined}>{label}</Link>)}
      </nav>
      <div className="topbar-end">
        <span className="sandbox" title="Test accounts only">Sandbox</span>
        <Link className="icon-link" href="/about" aria-label="About Snowball" aria-current={current("/about") ? "page" : undefined}>?</Link>
        {signedIn
          ? <Link className="account-link" href="/account" aria-current={current("/account") ? "page" : undefined}>Account</Link>
          : !current("/sign-in") && <Link className="account-link" href="/sign-in">Sign in</Link>}
      </div>
    </div>
  </header>;
}
