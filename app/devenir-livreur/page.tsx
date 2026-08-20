import { CourierSignupWizard, type CourierResumeState } from "@/components/courier-signup-wizard";
import { MvpShell } from "@/components/mvp-shell";
import { getAdminSupabase, getServerSupabase } from "@/lib/infrastructure/supabase/server";
import type { CourierVehicleType } from "@/lib/domain/courier-verification";

export const dynamic = "force-dynamic";

export default async function DevenirLivreurPage() {
  const admin = getAdminSupabase();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  // Reprise du parcours : si le profil livreur existe déjà pour l'utilisateur
  // connecté, on entre directement à l'étape des justificatifs.
  let resume: CourierResumeState | null = null;
  const supabase = await getServerSupabase();
  if (supabase && admin) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await admin
        .from("courier_profiles")
        .select("id, display_name, phone, email, vehicle_type, vehicle_registration, verification_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile) {
        const { data: verificationCase } = await admin
          .from("courier_verification_cases")
          .select("id, submitted_at, status")
          .eq("courier_id", profile.id)
          .order("submission_version", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data: documents } = verificationCase
          ? await admin
              .from("courier_verification_documents")
              .select("id, document_type, status, version, uploaded_at")
              .eq("case_id", verificationCase.id)
              .neq("status", "purged")
              .order("version", { ascending: false })
          : { data: [] };
        resume = {
          courierId: profile.id,
          caseId: verificationCase?.id ?? null,
          displayName: profile.display_name,
          phone: profile.phone,
          vehicleType: (profile.vehicle_type ?? "") as CourierVehicleType | "",
          vehicleRegistration: profile.vehicle_registration ?? "",
          email: profile.email ?? user.email ?? "",
          verificationStatus: profile.verification_status,
          submitted: Boolean(verificationCase?.submitted_at) && verificationCase?.status !== "rejected",
          documents: (documents ?? []) as CourierResumeState["documents"],
        };
      }
    }
  }

  return (
    <MvpShell>
      <main className="mvp-main merchant-application-page">
        <div className="mvp-shell">
          <CourierSignupWizard turnstileSiteKey={turnstileSiteKey} resume={resume} />
        </div>
      </main>
    </MvpShell>
  );
}
