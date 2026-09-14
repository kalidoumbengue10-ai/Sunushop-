import { NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/domain/safe-redirect";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const authError = url.searchParams.get("error");
  const safeNext = safeRedirectPath(url.searchParams.get("next"), "/");
  const supabase = await getServerSupabase();

  if (authError || !code || !supabase) {
    return NextResponse.redirect(
      new URL("/connexion?erreur=confirmation", url.origin),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/connexion?erreur=confirmation", url.origin),
    );
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
