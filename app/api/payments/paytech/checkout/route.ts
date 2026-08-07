import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/api/security";
import { paytechOrderCheckoutSchema } from "@/lib/domain/schemas";
import { getPaytechConfig } from "@/lib/config/env";
import { requestPayment } from "@/lib/providers/paytech";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = paytechOrderCheckoutSchema.parse(await request.json());
    const { supabase, user } = await requireUser();
    await enforceRateLimit({
      key: user.id,
      action: "paytech_checkout",
      windowSeconds: 60,
      maxRequests: 5,
    });

    const config = getPaytechConfig();
    if (!config) {
      throw new ApiError(
        503,
        "PAYTECH_NOT_CONFIGURED",
        "Le paiement en ligne n’est pas encore disponible.",
      );
    }

    const { data: batch, error: batchError } = await supabase
      .from("order_batches")
      .select("id, public_code, total_xof, buyer_id")
      .eq("id", input.orderBatchId)
      .eq("buyer_id", user.id)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
    }

    const refCommand = `ORD-${batch.public_code}-${crypto.randomUUID().slice(0, 8)}`;

    // Le montant vient toujours de la base (order_batches.total_xof, déjà
    // recalculé côté serveur par create_order_batch) — jamais du corps de
    // la requête.
    const { data: intent, error: intentError } = await supabase.rpc(
      "create_order_payment_intent",
      {
        p_order_batch_id: batch.id,
        p_ref_command: refCommand,
        p_amount_xof: batch.total_xof,
      },
    );
    if (intentError) throw intentError;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    const ipnUrl = new URL("/api/payments/paytech/ipn", siteUrl).toString();

    let paytechResult;
    try {
      paytechResult = await requestPayment({
        itemName: `Commande SunuShop ${batch.public_code}`,
        itemPrice: batch.total_xof,
        refCommand,
        commandName: `Commande ${batch.public_code}`,
        currency: "XOF",
        env: config.PAYTECH_ENV,
        ipnUrl,
        successUrl: new URL(`/paiement/succes?ref=${encodeURIComponent(refCommand)}`, siteUrl).toString(),
        cancelUrl: new URL(`/paiement/annule?ref=${encodeURIComponent(refCommand)}`, siteUrl).toString(),
        customField: JSON.stringify({ orderBatchId: batch.id, kind: "order" }),
      });
    } catch (error) {
      const admin = requireAdminClient();
      await admin
        .from("payment_intents")
        .update({ status: "failed" })
        .eq("id", intent.id);
      throw error;
    }

    const admin = requireAdminClient();
    await admin
      .from("payment_intents")
      .update({
        paytech_token: paytechResult.token,
        redirect_url: paytechResult.redirectUrl,
      })
      .eq("id", intent.id);

    return apiSuccess(
      { redirectUrl: paytechResult.redirectUrl, token: paytechResult.token, refCommand },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
