import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { subscriptionDecisionSchema } from "@/lib/domain/schemas";

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
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
