import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { merchantPickupSettingsSchema, merchantSettingsSchema } from "@/lib/domain/schemas";

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantSettingsSchema.parse(await request.json());
    const { supabase } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager"]);
    const { error } = await supabase.rpc("update_merchant_payment_numbers", {
      p_merchant_id: input.merchantId,
      p_wave_number: input.wavePaymentNumber,
      p_orange_money_number: input.orangeMoneyPaymentNumber,
    });
    if (error) throw error;

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

    // merchant_accounts.pickup_enabled est désormais la source de vérité
    // unique du retrait en boutique : on répercute automatiquement sur la
    // zone de livraison "pickup" (créée si absente), pour que les deux
    // mécanismes historiquement parallèles restent synchronisés.
    await syncPickupDeliveryZone(admin, input.merchantId, input.pickupEnabled);

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

async function syncPickupDeliveryZone(
  admin: Awaited<ReturnType<typeof requireActiveMerchantAccess>>["admin"],
  merchantId: string,
  pickupEnabled: boolean,
) {
  const { data: pickupMethod } = await admin
    .from("delivery_methods")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("kind", "pickup")
    .maybeSingle();

  if (!pickupMethod) {
    if (!pickupEnabled) return;
    const { data: createdMethod, error: methodError } = await admin
      .from("delivery_methods")
      .insert({ merchant_id: merchantId, kind: "pickup", name: "Retrait en boutique" })
      .select("id")
      .single();
    if (methodError) throw methodError;
    const { error: zoneError } = await admin.from("delivery_zones").insert({
      delivery_method_id: createdMethod.id,
      merchant_id: merchantId,
      region: "Retrait boutique",
      label: "Retrait en boutique",
      fee_xof: 0,
      min_delay_minutes: 0,
      max_delay_minutes: 1440,
      active: true,
    });
    if (zoneError) throw zoneError;
    return;
  }

  const { data: existingZone } = await admin
    .from("delivery_zones")
    .select("id")
    .eq("delivery_method_id", pickupMethod.id)
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (!existingZone) {
    if (!pickupEnabled) return;
    const { error: zoneError } = await admin.from("delivery_zones").insert({
      delivery_method_id: pickupMethod.id,
      merchant_id: merchantId,
      region: "Retrait boutique",
      label: "Retrait en boutique",
      fee_xof: 0,
      min_delay_minutes: 0,
      max_delay_minutes: 1440,
      active: true,
    });
    if (zoneError) throw zoneError;
    return;
  }

  const { error: updateError } = await admin
    .from("delivery_zones")
    .update({ active: pickupEnabled })
    .eq("id", existingZone.id);
  if (updateError) throw updateError;
}
