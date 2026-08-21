import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/api/security";
import { deriveDeliveryCode, hashDeliveryCode } from "@/lib/domain/delivery-code";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user } = await requireUser();
    // Coût email + renouvellement de code à la demande : borner par acheteur,
    // pas seulement par commande, pour empêcher le spam multi-commandes.
    await enforceRateLimit({ key: `user:${user.id}`, action: "delivery_code_resend", windowSeconds: 900, maxRequests: 5 });
    const admin = requireAdminClient();
    const { data: order } = await admin.from("orders").select("buyer_id, public_code").eq("id", id).maybeSingle();
    if (!order || order.buyer_id !== user.id) throw new ApiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
    const { data: delivery } = await (admin as any).from("deliveries").select("id, status, recipient_code_version").eq("order_id", id).in("status", ["picked_up", "in_transit"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!delivery || !["picked_up", "in_transit"].includes(delivery.status)) throw new ApiError(409, "CODE_NOT_AVAILABLE", "Le code n’est pas disponible à cette étape.");
    const version = Number(delivery.recipient_code_version ?? 0) + 1;
    const code = deriveDeliveryCode(delivery.id, "recipient", version);
    const { data: updated, error } = await (admin as any).from("deliveries").update({ recipient_code_version: version, recipient_code_hash: hashDeliveryCode(code), recipient_code_attempts: 0 }).eq("id", delivery.id).eq("recipient_code_version", version - 1).select("id").maybeSingle();
    if (error) throw error;
    if (!updated) throw new ApiError(409, "CODE_ALREADY_RENEWED", "Un nouveau code vient déjà d’être généré. Actualisez la page.");
    await enqueueEmail(admin, {
      dedupeKey: `recipient-code:${delivery.id}:${version}`,
      template: "recipient_delivery_code",
      recipientUserId: user.id,
      payload: { orderCode: order.public_code, code, url: new URL(`/commandes/${id}`, request.url).toString() },
      sendImmediately: true,
    });
    await admin.from("audit_events").insert({ actor_id: user.id, action: "delivery.recipient_code.resent", entity_type: "delivery", entity_id: delivery.id, request_id: requestId, metadata: { version } });
    return apiSuccess({ code }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
