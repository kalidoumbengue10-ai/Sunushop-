import { Suspense } from "react";
import { CourierInvitationAccess } from "@/components/courier-access";
import { MvpShell } from "@/components/mvp-shell";

export default function CourierInvitationPage() {
  return <MvpShell><main className="courier-access-page"><Suspense fallback={<p className="mvp-alert">Chargement…</p>}><CourierInvitationAccess /></Suspense></main></MvpShell>;
}

