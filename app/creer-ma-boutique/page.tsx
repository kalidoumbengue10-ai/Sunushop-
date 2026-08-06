import { MerchantSignupWizard } from "@/components/merchant-signup-wizard";
import { MvpShell } from "@/components/mvp-shell";
import {
  getAdminSupabase,
  getServerSupabase,
} from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function CreerMaBoutiquePage() {
  const admin = getAdminSupabase();
  const { data: categories } = admin
    ? await admin.from("categories").select("name").eq("active", true).order("position")
    : { data: [] };
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  // Reprise du parcours : si un compte marchand existe déjà pour l'utilisateur
  // connecté (étape 2 franchie), on rentre directement à l'étape 3 au lieu de
  // recommencer depuis le début.
  let resume: { merchantId: string; caseId: string | null; kind: "informal" | "formal"; publicName: string; representativeIsLegalOwner: boolean } | null = null;
  const supabase = await getServerSupabase();
  if (supabase && admin) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: membership } = await admin
        .from("merchant_members")
        .select("merchant_id")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .eq("active", true)
        .maybeSingle();
      if (membership) {
        const { data: merchant } = await admin
          .from("merchant_accounts")
          .select("id, kind, public_name, representative_is_legal_owner")
          .eq("id", membership.merchant_id)
          .maybeSingle();
        const { data: verificationCase } = await admin
          .from("verification_cases")
          .select("id")
          .eq("merchant_id", membership.merchant_id)
          .order("submission_version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (merchant) {
          resume = {
            merchantId: merchant.id,
            caseId: verificationCase?.id ?? null,
            kind: merchant.kind,
            publicName: merchant.public_name,
            representativeIsLegalOwner: merchant.representative_is_legal_owner,
          };
        }
      }
    }
  }

  return (
    <MvpShell>
      <main className="mvp-main merchant-application-page">
        <div className="mvp-shell">
          <MerchantSignupWizard
            categories={categories ?? []}
            turnstileSiteKey={turnstileSiteKey}
            resume={resume}
          />
        </div>
      </main>
    </MvpShell>
  );
}
