import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return { url, key };
}

// Server-only Supabase client bound to the request's auth cookies. The browser never gets a client.
export async function createClient() {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components can't set cookies; proxy.ts refreshes the session on each request instead.
        try { for (const { name, value, options } of list) store.set(name, value, options); } catch {}
      },
    },
  });
}
