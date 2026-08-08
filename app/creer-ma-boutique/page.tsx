import { MerchantSignupWizard } from "@/components/merchant-signup-wizard";
import { MvpShell } from "@/components/mvp-shell";
import {
  getAdminSupabase,
  getServerSupabase,
} from "@/lib/infrastructure/supabase/server";
import { requiredVerificationDocuments } from "@/lib/domain/verification";

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
  let resume: {
    merchantId: string;
    caseId: string | null;
    kind: "informal" | "formal";
    publicName: string;
    representativeIsLegalOwner: boolean;
    contactName: string;
    phone: string;
    city: string;
    legalName: string;
    salesChannel: string;
    categories: string[];
    email: string;
    editable: boolean;
    initialStep: "identite" | "lettre";
    intentLetterDocumentId: string | null;
  } | null = null;
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
          .select("id, kind, public_name, representative_is_legal_owner, phone, city, legal_name, email")
          .eq("id", membership.merchant_id)
          .maybeSingle();
        const { data: verificationCase } = await admin
          .from("verification_cases")
          .select("id, status")
          .eq("merchant_id", membership.merchant_id)
          .order("submission_version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (merchant) {
          const [{ data: lead }, { data: documents }] = await Promise.all([
            admin.from("crm_leads").select("full_name, sales_channel, metadata").eq("merchant_id", merchant.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
            verificationCase
              ? admin.from("verification_documents").select("id, document_type, status, version").eq("case_id", verificationCase.id).neq("status", "purged").order("version", { ascending: false })
              : Promise.resolve({ data: [] }),
          ]);
          const latestByType = new Map<string, { id: string }>();
          for (const document of documents ?? []) {
            if (!latestByType.has(document.document_type)) latestByType.set(document.document_type, document);
          }
          const required = requiredVerificationDocuments(merchant.kind, merchant.representative_is_legal_owner).required
            .filter((type) => type !== "intent_letter");
          const identityComplete = required.every((type) => latestByType.has(type));
          const metadata = lead?.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
            ? lead.metadata as Record<string, unknown>
            : {};
          resume = {
            merchantId: merchant.id,
            caseId: verificationCase?.id ?? null,
            kind: merchant.kind,
            publicName: merchant.public_name,
            representativeIsLegalOwner: merchant.representative_is_legal_owner,
            contactName: lead?.full_name ?? String(user.user_metadata?.display_name ?? ""),
            phone: merchant.phone,
            city: merchant.city ?? "",
            legalName: merchant.legal_name ?? "",
            salesChannel: lead?.sales_channel ?? "Boutique",
            categories: Array.isArray(metadata.categories) ? metadata.categories.filter((value): value is string => typeof value === "string") : [],
            email: merchant.email ?? user.email ?? "",
            editable: ["draft", "needs_changes"].includes(verificationCase?.status ?? "draft"),
            initialStep: identityComplete ? "lettre" : "identite",
            intentLetterDocumentId: latestByType.get("intent_letter")?.id ?? null,
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
