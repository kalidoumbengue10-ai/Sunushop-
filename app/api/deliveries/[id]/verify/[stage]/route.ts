import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { deriveDeliveryCode } from "@/lib/domain/delivery-code";
import { deliveryCodeSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

type AtomicVerification = {
  verified: boolean;
  locked: boolean;
  attempts: number;
  delivery?: unknown;
};

export async function POST(request: Request, context: { params: Promise<{ id: string; stage: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id, stage } = await context.params;
    if (stage !== "pickup" && stage !== "recipient") {
      throw new ApiError(404, "DELIVERY_NOT_FOUND", "Étape inconnue.");
    }
    const input = deliveryCodeSchema.parse(await request.json());
    const { user, supabase } = await requireUser();
    const admin = requireAdminClient();
    const { data: delivery, error } = await admin
      .from("deliveries")
      .select("id, order_id, merchant_id, recipient_code_version")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!delivery) throw new ApiError(404, "DELIVERY_NOT_FOUND", "Livraison introuvable.");

    const { data, error: verifyError } = await (supabase as any).rpc("verify_delivery_code_atomic", {
      p_delivery_id: id,
      p_stage: stage,
      p_code: input.code,
      p_actor_id: user.id,
    });
    if (verifyError) throw verifyError;
    const result = data as AtomicVerification;
    if (!result.verified) {
      await admin.from("audit_events").insert({
        actor_id: user.id,
        merchant_id: delivery.merchant_id,
        action: "delivery.code.failed",
        entity_type: "delivery",
        entity_id: id,
        request_id: requestId,
        metadata: { stage, attempt: result.attempts, locked: result.locked },
      });
      if (result.locked) {
        throw new ApiError(429, "DELIVERY_CODE_LOCKED", "Code verrouillé. Un responsable de la boutique doit réinitialiser les essais.");
      }
      throw new ApiError(422, "DELIVERY_CODE_INVALID", "Code incorrect.");
    }

    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: delivery.merchant_id,
      action: "delivery.code.verified",
      entity_type: "delivery",
      entity_id: id,
      request_id: requestId,
      metadata: { stage },
    });
    if (stage === "pickup") {
      const { data: order } = await admin.from("orders").select("buyer_id, public_code").eq("id", delivery.order_id).maybeSingle();
      if (order) {
        await enqueueEmail(admin, {
          dedupeKey: `recipient-code:${id}:initial`,
          template: "recipient_delivery_code",
          recipientUserId: order.buyer_id,
          payload: {
            orderCode: order.public_code,
            code: deriveDeliveryCode(id, "recipient", delivery.recipient_code_version ?? 0),
            url: new URL(`/commandes/${delivery.order_id}`, request.url).toString(),
          },
          sendImmediately: true,
        }).catch(() => false);
      }
    }
    return apiSuccess(result.delivery, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
