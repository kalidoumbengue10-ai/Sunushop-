import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { verificationDecisionSchema } from "@/lib/domain/schemas";
import { merchantStatusLabel } from "@/lib/domain/merchant-ui";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = verificationDecisionSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["reviewer", "admin"]);
    const { data, error } = await supabase.rpc("review_verification_case", {
      p_case_id: id,
      p_outcome: input.outcome,
      p_reason_code: input.reasonCode ?? null,
      p_merchant_message: input.merchantMessage ?? null,
      p_internal_note: input.internalNote ?? null,
    });
    if (error) throw error;
    if (input.outcome === "approved" && data?.merchant_id) {
      const { error: crmError } = await requireAdminClient().from("crm_leads").update({
        status: "converted",
        converted_at: new Date().toISOString(),
      }).eq("merchant_id", data.merchant_id);
      if (crmError) throw crmError;
    }
    if (data?.merchant_id) {
      const admin = requireAdminClient();
      const { data: merchant } = await admin.from("merchant_accounts").select("owner_user_id, email, public_name").eq("id", data.merchant_id).maybeSingle();
      if (merchant) await enqueueEmail(admin, { dedupeKey: `verification-decision:${id}:${input.outcome}`, template: input.outcome === "approved" ? "merchant_documents_approved" : "verification_decision", to: merchant.email, recipientUserId: merchant.owner_user_id, payload: { shopName: merchant.public_name, statusLabel: merchantStatusLabel(input.outcome), message: input.merchantMessage, url: new URL("/marchand", request.url).toString() } }).catch(() => false);
    }
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
