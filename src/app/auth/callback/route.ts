import { NextResponse, type NextRequest } from "next/server";
import { appUrl, safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Google sign-in, and email links sent with Supabase's default templates, return here with a
// one-time code. The code only works in the browser that started the flow.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(appUrl(safeNext(params.get("next"))));
    } catch {}
  }
  return NextResponse.redirect(appUrl("/sign-in?error=callback"));
}
