import { Suspense } from "react";
import { RechercheClient } from "@/components/recherche-client";
import { MvpShell } from "@/components/mvp-shell";

export default function RecherchePage() {
  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <Suspense fallback={null}>
            <RechercheClient />
          </Suspense>
        </div>
      </main>
    </MvpShell>
  );
}
