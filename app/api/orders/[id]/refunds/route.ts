import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { orderRefundDecisionSchema, orderRefundDeclarationSchema } from "@/lib/domain/schemas";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = orderRefundDeclarationSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("declare_order_refund", {
      p_order_id: id, p_amount_xof: input.amountXof, p_channel: input.channel,
      p_external_reference: input.externalReference, p_destination_number: input.destinationNumber,
    });
    if (error) throw error;
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = orderRefundDecisionSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("review_order_refund", {
      p_refund_id: input.refundId, p_decision: input.decision, p_contest_reason: input.contestReason ?? null,
    });
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
