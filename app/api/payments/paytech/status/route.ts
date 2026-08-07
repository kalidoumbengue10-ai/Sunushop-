import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { supabase, user } = await requireUser();
    const ref = new URL(request.url).searchParams.get("ref")?.trim();
    if (!ref) {
      throw new ApiError(400, "VALIDATION_ERROR", "Référence de paiement manquante.");
    }

    // Ne jamais créditer une commande sur la seule base du retour navigateur
    // success_url : on lit toujours payment_intents.status en base, mis à
    // jour uniquement par l'IPN signé (capture_order_payment).
    const { data: intent, error } = await supabase
      .from("payment_intents")
      .select("id, status, order_batch_id, kind, amount_xof")
      .eq("ref_command", ref)
      .eq("buyer_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!intent) {
      throw new ApiError(404, "PAYMENT_INTENT_NOT_FOUND", "Intention de paiement introuvable.");
    }

    return apiSuccess(
      {
        status: intent.status,
        orderBatchId: intent.order_batch_id,
        kind: intent.kind,
        amountXof: intent.amount_xof,
      },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
