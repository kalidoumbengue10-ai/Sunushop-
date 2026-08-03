import { requireApprovedMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { merchantSettingsSchema } from "@/lib/domain/schemas";

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantSettingsSchema.parse(await request.json());
    const { user, admin } = await requireApprovedMerchantAccess(input.merchantId, ["owner", "manager"]);
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
