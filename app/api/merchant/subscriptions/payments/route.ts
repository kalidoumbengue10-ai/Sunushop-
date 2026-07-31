import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { subscriptionPaymentSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = subscriptionPaymentSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc(
      "submit_subscription_payment",
      {
        p_merchant_id: input.merchantId,
        p_plan_id: input.planId,
        p_channel: input.channel,
        p_external_reference: input.externalReference,
        p_amount_xof: input.amountXof,
        p_paid_at: input.paidAt,
      },
    );
    if (error) throw error;
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
