import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { courierPayoutDecisionSchema } from "@/lib/domain/schemas";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = courierPayoutDecisionSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("review_courier_payout", {
      p_payout_id: id,
      p_decision: input.decision,
      p_contest_reason: input.contestReason ?? null,
    });
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
