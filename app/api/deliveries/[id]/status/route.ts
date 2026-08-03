import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { canTransitionDelivery, type DeliveryStatus } from "@/lib/domain/delivery";
import { deliveryStatusSchema } from "@/lib/domain/schemas";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = deliveryStatusSchema.parse(await request.json());
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: delivery, error } = await admin
      .from("deliveries")
      .select("id, merchant_id, status, courier_memberships!inner(courier_user_id)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const membership = delivery && (Array.isArray(delivery.courier_memberships) ? delivery.courier_memberships[0] : delivery.courier_memberships);
    if (!delivery || membership?.courier_user_id !== user.id) {
      throw new ApiError(404, "DELIVERY_NOT_FOUND", "Livraison introuvable.");
    }
    if (!canTransitionDelivery(delivery.status as DeliveryStatus, input.status as DeliveryStatus)) {
      throw new ApiError(409, "DELIVERY_TRANSITION_NOT_ALLOWED", "Transition impossible.");
    }
    if (input.status === "failed" && !input.note) {
      throw new ApiError(422, "DELIVERY_FAILURE_REASON_REQUIRED", "Précisez la raison de l’échec.");
    }
    const { data, error: updateError } = await admin
      .from("deliveries")
      .update({ status: input.status, failure_reason: input.status === "failed" ? input.note : null })
      .eq("id", id)
      .select("id, status")
      .single();
    if (updateError) throw updateError;
    await admin.from("delivery_events").insert({
      delivery_id: id,
      merchant_id: delivery.merchant_id,
      actor_id: user.id,
      from_status: delivery.status,
      to_status: input.status,
      public_message: input.note ?? `Livraison : ${input.status.replaceAll("_", " ")}.`,
    });
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
