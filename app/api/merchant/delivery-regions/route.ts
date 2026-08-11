import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SENEGAL_REGIONS } from "@/lib/domain/merchant-ui";
import { deliveryRegionInputSchema } from "@/lib/domain/schemas";

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = deliveryRegionInputSchema.parse(await request.json());
    if (!(SENEGAL_REGIONS as readonly string[]).includes(input.region)) {
      throw new ApiError(400, "DELIVERY_REGION_INVALID", "Choisissez une région du Sénégal.");
    }
    const { supabase } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager", "fulfillment"]);
    const admin = requireAdminClient();
    let existingQuery = admin
      .from("delivery_zones")
      .select("id")
      .eq("merchant_id", input.merchantId);
    existingQuery = input.zoneId
      ? existingQuery.eq("id", input.zoneId)
      : existingQuery.eq("region", input.region).is("city", null);
    const { data: existing, error: existingError } = await existingQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    let zoneId = existing?.id;
    if (!zoneId) {
      const { data, error } = await supabase.rpc("create_delivery_zone", {
        p_merchant_id: input.merchantId,
        p_method_kind: "merchant_delivery",
        p_method_name: "Livraison à domicile",
        p_region: input.region,
        p_city: null,
        p_label: input.region,
        p_fee_xof: input.feeXof,
        p_min_delay_minutes: input.minDelayDays * 1440,
        p_max_delay_minutes: input.maxDelayDays * 1440,
      });
      if (error) throw error;
      zoneId = (data as { zoneId: string }).zoneId;
    } else {
      const { error } = await admin.from("delivery_zones").update({
        label: input.region,
        fee_xof: input.feeXof,
        courier_fee_xof: input.courierFeeXof,
        min_delay_minutes: input.minDelayDays * 1440,
        max_delay_minutes: input.maxDelayDays * 1440,
        active: input.enabled,
        city: null,
      }).eq("id", zoneId);
      if (error) throw error;
    }

    if (!existing?.id) {
      const { error: courierFeeError } = await admin
        .from("delivery_zones")
        .update({ courier_fee_xof: input.courierFeeXof })
        .eq("id", zoneId);
      if (courierFeeError) throw courierFeeError;
    }

    const { error: deleteError } = await admin
      .from("delivery_category_rates")
      .delete()
      .eq("delivery_zone_id", zoneId);
    if (deleteError) throw deleteError;
    if (input.categoryRates.length) {
      const { error: rateError } = await admin.from("delivery_category_rates").insert(
        input.categoryRates.map((rate) => ({
          delivery_zone_id: zoneId,
          merchant_id: input.merchantId,
          category_id: rate.categoryId,
          fee_xof: rate.feeXof,
        })),
      );
      if (rateError) throw rateError;
    }
    return apiSuccess({ zoneId }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
