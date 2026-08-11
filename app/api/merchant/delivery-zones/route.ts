import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { deliveryZoneInputSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = deliveryZoneInputSchema.parse(await request.json());
    const { supabase, admin } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager", "fulfillment"]);
    const { data, error } = await supabase.rpc("create_delivery_zone", {
      p_merchant_id: input.merchantId,
      p_method_kind: input.methodKind,
      p_method_name: input.methodName,
      p_region: input.region,
      p_city: input.city ?? null,
      p_label: input.label,
      p_fee_xof: input.feeXof,
      p_min_delay_minutes: input.minDelayMinutes,
      p_max_delay_minutes: input.maxDelayMinutes,
    });
    if (error) throw error;
    if (input.courierFeeXof !== undefined) {
      const zoneId = (data as { zoneId: string }).zoneId;
      const { error: updateError } = await admin
        .from("delivery_zones")
        .update({ courier_fee_xof: input.courierFeeXof })
        .eq("id", zoneId);
      if (updateError) throw updateError;
    }
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
