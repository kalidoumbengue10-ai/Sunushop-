import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/api/security";
import { paytechSubscriptionCheckoutSchema } from "@/lib/domain/schemas";
import { getPaytechConfig } from "@/lib/config/env";
import { requestPayment } from "@/lib/providers/paytech";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = paytechSubscriptionCheckoutSchema.parse(await request.json());
    const { user, supabase } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager"]);
    await enforceRateLimit({
      key: user.id,
      action: "paytech_subscription_checkout",
      windowSeconds: 60,
      maxRequests: 5,
    });

    const config = getPaytechConfig();
    if (!config) {
      throw new ApiError(503, "PAYTECH_NOT_CONFIGURED", "Le paiement en ligne n’est pas encore disponible.");
    }

    // Le prix vient toujours de subscription_plans.monthly_price_xof lu en
    // base — jamais du corps de la requête.
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, name, monthly_price_xof")
      .eq("id", input.planId)
      .eq("active", true)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan) {
      throw new ApiError(404, "SUBSCRIPTION_PLAN_NOT_FOUND", "Le plan d’abonnement sélectionné est indisponible.");
    }

    const refCommand = `SUB-${input.merchantId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
    const admin = requireAdminClient();
    const { data: intent, error: intentError } = await admin
      .from("payment_intents")
      .insert({
        kind: "subscription",
        ref_command: refCommand,
        merchant_id: input.merchantId,
        plan_id: plan.id,
        buyer_id: user.id,
        amount_xof: plan.monthly_price_xof,
      })
      .select("id")
      .single();
    if (intentError) throw intentError;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    const ipnUrl = new URL("/api/payments/paytech/ipn", siteUrl).toString();

    let paytechResult;
    try {
      paytechResult = await requestPayment({
        itemName: `Abonnement SunuShop — ${plan.name}`,
        itemPrice: plan.monthly_price_xof,
        refCommand,
        commandName: `Abonnement ${plan.name}`,
        currency: "XOF",
        env: config.PAYTECH_ENV,
        ipnUrl,
        successUrl: new URL(`/paiement/succes?ref=${encodeURIComponent(refCommand)}`, siteUrl).toString(),
        cancelUrl: new URL(`/paiement/annule?ref=${encodeURIComponent(refCommand)}`, siteUrl).toString(),
        customField: JSON.stringify({ merchantId: input.merchantId, kind: "subscription" }),
      });
    } catch (error) {
      await admin.from("payment_intents").update({ status: "failed" }).eq("id", intent.id);
      throw error;
    }

    await admin
      .from("payment_intents")
      .update({ paytech_token: paytechResult.token, redirect_url: paytechResult.redirectUrl })
      .eq("id", intent.id);

    return apiSuccess(
      { redirectUrl: paytechResult.redirectUrl, token: paytechResult.token, refCommand },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
