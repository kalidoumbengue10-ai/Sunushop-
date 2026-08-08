import { normalizeMerchantPhone } from "@/lib/api/merchant-onboarding";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { requireEditableVerificationCase } from "@/lib/api/verification-case-access";
import { merchantOnboardingUpdateSchema } from "@/lib/domain/schemas";
import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantOnboardingUpdateSchema.parse(await request.json());
    const { user, verificationCase } = await requireEditableVerificationCase(input.caseId);
    if (verificationCase.merchant_id !== input.merchantId) {
      throw new ApiError(404, "MERCHANT_NOT_FOUND", "Boutique introuvable.");
    }

    const admin = requireAdminClient();
    const { error: merchantError } = await admin
      .from("merchant_accounts")
      .update({
        kind: input.businessType,
        legal_name: input.businessType === "formal" ? input.legalName : null,
        public_name: input.shopName,
        phone: normalizeMerchantPhone(input.phone),
        city: input.city || null,
      })
      .eq("id", input.merchantId);
    if (merchantError) throw merchantError;

    const { data: lead, error: leadError } = await admin
      .from("crm_leads")
      .select("id, metadata")
      .eq("merchant_id", input.merchantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (leadError) throw leadError;
    if (lead) {
      const metadata = lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
        ? lead.metadata
        : {};
      const { error: updateLeadError } = await admin
        .from("crm_leads")
        .update({
          full_name: input.contactName,
          business_name: input.shopName,
          phone: input.phone,
          city: input.city || null,
          business_type: input.businessType,
          sales_channel: input.salesChannel,
          metadata: { ...metadata, categories: input.categories, legalName: input.legalName || null },
        })
        .eq("id", lead.id);
      if (updateLeadError) throw updateLeadError;
    }

    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: input.merchantId,
      action: "merchant.onboarding.update",
      entity_type: "merchant_account",
      entity_id: input.merchantId,
      request_id: requestId,
    });

    return apiSuccess({ updated: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
