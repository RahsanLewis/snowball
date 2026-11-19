import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl, safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const types: EmailOtpType[] = ["email", "signup", "recovery", "email_change"];

// Email confirmation and password-reset links. token_hash links work in any browser,
// unlike code links, which need the browser that started the flow.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? "/reset-password" : "/";
  if (tokenHash && type && types.includes(type)) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(appUrl(safeNext(params.get("next"), fallback)));
    } catch {}
  }
  return NextResponse.redirect(appUrl("/sign-in?error=link"));
}
