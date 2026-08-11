import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { courierPaymentProfileSchema } from "@/lib/domain/schemas";

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = courierPaymentProfileSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("update_courier_payment_profile", {
      p_wave_number: input.wavePaymentNumber,
      p_orange_money_number: input.orangeMoneyPaymentNumber,
      p_preferred_channel: input.preferredPaymentChannel,
    });
    if (error) throw error;
    return apiSuccess({ membershipsUpdated: data ?? 0 }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
