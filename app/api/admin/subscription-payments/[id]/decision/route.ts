import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { subscriptionDecisionSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = subscriptionDecisionSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["admin"]);
    const { data, error } = await supabase.rpc(
      "review_subscription_payment",
      {
        p_submission_id: id,
        p_approved: input.approved,
        p_rejection_reason: input.rejectionReason ?? null,
      },
    );
    if (error) throw error;
    if (data?.merchant_id) {
      const admin = requireAdminClient();
      const { data: merchant } = await admin.from("merchant_accounts").select("owner_user_id, email").eq("id", data.merchant_id).maybeSingle();
      if (merchant) await enqueueEmail(admin, { dedupeKey: `subscription-decision:${id}:${input.approved}`, template: input.approved ? "subscription_activated" : "verification_decision", to: merchant.email, recipientUserId: merchant.owner_user_id, payload: { statusLabel: input.approved ? "Abonnement activé" : "Paiement refusé", message: input.rejectionReason, url: new URL("/marchand", request.url).toString() } }).catch(() => false);
    }
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
