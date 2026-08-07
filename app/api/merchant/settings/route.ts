import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { merchantPickupSettingsSchema, merchantSettingsSchema } from "@/lib/domain/schemas";

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantSettingsSchema.parse(await request.json());
    const { user, admin } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager"]);
    const { error } = await admin
      .from("merchant_accounts")
      .update({
        wave_payment_number: input.wavePaymentNumber,
        orange_money_payment_number: input.orangeMoneyPaymentNumber,
      })
      .eq("id", input.merchantId);
    if (error) throw error;

    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: input.merchantId,
      action: "merchant.payment_settings.update",
      entity_type: "merchant_account",
      entity_id: input.merchantId,
      request_id: requestId,
    });

    return apiSuccess({ updated: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantPickupSettingsSchema.parse(await request.json());
    const { user, admin } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager"]);

    // Whitelist d'écriture explicite, colonne par colonne — jamais
    // ...input : un marchand ne doit jamais pouvoir écrire status,
    // subscription_status ou verification_status via cette route.
    const { error } = await admin
      .from("merchant_accounts")
      .update({
        pickup_enabled: input.pickupEnabled,
        pickup_address_line: input.pickupAddressLine,
        pickup_latitude: input.pickupLatitude ?? null,
        pickup_longitude: input.pickupLongitude ?? null,
        pickup_hours: input.pickupHours ?? null,
        pickup_instructions: input.pickupInstructions ?? null,
      })
      .eq("id", input.merchantId);
    if (error) throw error;

    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: input.merchantId,
      action: "merchant.pickup_settings.update",
      entity_type: "merchant_account",
      entity_id: input.merchantId,
      request_id: requestId,
    });

    return apiSuccess({ updated: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
