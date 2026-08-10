import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { verifyDeliveryCode } from "@/lib/domain/delivery-code";
import { deliveryCodeSchema } from "@/lib/domain/schemas";

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
      .select("id, merchant_id, status, pickup_code_hash, recipient_code_hash, pickup_code_attempts, recipient_code_attempts, code_attempt_limit, courier_memberships!inner(courier_user_id)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!delivery) throw new ApiError(404, "DELIVERY_NOT_FOUND", "Livraison introuvable.");
    const membership = Array.isArray(delivery.courier_memberships) ? delivery.courier_memberships[0] : delivery.courier_memberships;
    if (stage === "pickup") {
      const { data: merchantMember } = await supabase
        .from("merchant_members")
        .select("role")
        .eq("merchant_id", delivery.merchant_id)
        .eq("user_id", user.id)
        .eq("active", true)
        .in("role", ["owner", "manager", "fulfillment"])
        .maybeSingle();
      if (!merchantMember) throw new ApiError(404, "DELIVERY_NOT_FOUND", "Livraison introuvable.");
    } else if (membership?.courier_user_id !== user.id) {
      throw new ApiError(404, "DELIVERY_NOT_FOUND", "Livraison introuvable.");
    }

    const attemptField = stage === "pickup" ? "pickup_code_attempts" : "recipient_code_attempts";
    const attempts = stage === "pickup" ? delivery.pickup_code_attempts : delivery.recipient_code_attempts;
    if (attempts >= delivery.code_attempt_limit) {
      throw new ApiError(429, "DELIVERY_CODE_LOCKED", "Code verrouillé. Un responsable de la boutique doit réinitialiser les essais.");
    }
    const expected = stage === "pickup" ? delivery.pickup_code_hash : delivery.recipient_code_hash;
    if (!verifyDeliveryCode(expected, input.code)) {
      await admin.from("deliveries").update({ [attemptField]: attempts + 1 }).eq("id", id);
      await admin.from("audit_events").insert({
        actor_id: user.id,
        merchant_id: delivery.merchant_id,
        action: "delivery.code.failed",
        entity_type: "delivery",
        entity_id: id,
        request_id: requestId,
        metadata: { stage, attempt: attempts + 1 },
      });
      throw new ApiError(422, "DELIVERY_CODE_INVALID", "Code incorrect.");
    }
    const { data, error: completeError } = await admin.rpc("complete_delivery_stage", {
      p_delivery_id: id,
      p_stage: stage,
      p_actor_id: user.id,
    });
    if (completeError) throw completeError;
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: delivery.merchant_id,
      action: "delivery.code.verified",
      entity_type: "delivery",
      entity_id: id,
      request_id: requestId,
      metadata: { stage },
    });
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
