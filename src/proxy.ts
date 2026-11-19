import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const signedInOnly = ["/cards", "/plan", "/account", "/reset-password"];
const signedOutOnly = ["/sign-in", "/sign-up", "/forgot-password"];
const under = (path: string, roots: string[]) => roots.some((root) => path === root || path.startsWith(`${root}/`));

// Refreshes the Supabase session cookie on every request and keeps signed-out visitors off private pages.
// Pages and API routes still check the user themselves; this is not the only guard.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const signedIn = typeof data?.claims?.sub === "string";
  const path = request.nextUrl.pathname;

  const redirect = (target: URL) => {
    const next = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
    return next;
  };
  if (!signedIn && under(path, signedInOnly)) {
    const target = new URL("/sign-in", request.nextUrl);
    target.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return redirect(target);
  }
  if (signedIn && under(path, signedOutOnly)) return redirect(new URL("/", request.nextUrl));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
