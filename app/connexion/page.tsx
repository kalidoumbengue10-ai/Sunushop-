import { Suspense } from "react";
import { AuthFlow } from "@/components/auth-flow";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { isSupabaseConfigured } from "@/lib/config/env";

export default function ConnexionPage() {
  const configured = isSupabaseConfigured();

  return (
    <MvpShell>
      <main className="mvp-auth">
        {!configured && <SetupRequired />}
        <Suspense fallback={<p>Chargement…</p>}>
          <AuthFlow
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </Suspense>
      </main>
    </MvpShell>
  );
}
