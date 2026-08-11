import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("record_pickup_cash_payment", { p_order_id: id });
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
