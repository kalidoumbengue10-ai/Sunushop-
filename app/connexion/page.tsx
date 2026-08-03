import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthFlow } from "@/components/auth-flow";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { isSupabaseConfigured } from "@/lib/config/env";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const configured = isSupabaseConfigured();
  const requestedNext = (await searchParams).next;
  if (configured && requestedNext?.startsWith("/invitations/claim?token=")) {
    const supabase = await getServerSupabase();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (user) redirect(requestedNext);
  }

  return (
    <MvpShell>
      <main className="mvp-auth">
        {!configured && <SetupRequired />}
        <Suspense fallback={<p>Chargement…</p>}>
          <AuthFlow
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()}
          />
        </Suspense>
      </main>
    </MvpShell>
  );
}
