import { Suspense } from "react";
import { InvitationClaim } from "@/components/invitation-claim";
import { MvpShell } from "@/components/mvp-shell";

export default function InvitationClaimPage() {
  return (
    <MvpShell>
      <main className="mvp-auth">
        <Suspense fallback={<p>Validation…</p>}><InvitationClaim /></Suspense>
      </main>
    </MvpShell>
  );
}
