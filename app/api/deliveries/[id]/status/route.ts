import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { canTransitionDelivery, type DeliveryStatus } from "@/lib/domain/delivery";
import { deliveryStatusSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = deliveryStatusSchema.parse(await request.json());
    const { user, supabase } = await requireUser();
    const admin = requireAdminClient();
    const { data: delivery, error } = await admin
      .from("deliveries")
      .select("id, order_id, merchant_id, status, courier_memberships!inner(courier_user_id), orders!inner(public_code, buyer_id, merchant_accounts!inner(email, owner_user_id, public_name))")
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
    if (input.status === "failed" && (!input.note || !input.failureReason)) {
      throw new ApiError(422, "DELIVERY_FAILURE_REASON_REQUIRED", "Précisez la raison de l’échec.");
    }

    if (input.status === "failed") {
      const { data, error: failureError } = await (supabase as any).rpc("report_delivery_failure", {
        p_delivery_id: id,
        p_actor_id: user.id,
        p_reason: input.failureReason,
        p_details: input.note,
      });
      if (failureError) throw failureError;
      const order = Array.isArray(delivery.orders) ? delivery.orders[0] : delivery.orders;
      const merchant = order && (Array.isArray(order.merchant_accounts) ? order.merchant_accounts[0] : order.merchant_accounts);
      await Promise.all([
        merchant?.email ? enqueueEmail(admin, {
          dedupeKey: `delivery-failed:${id}:merchant`,
          template: "delivery_failed_merchant",
          to: merchant.email,
          recipientUserId: merchant.owner_user_id,
          payload: { orderCode: order?.public_code, shopName: merchant.public_name, reason: input.note, url: new URL("/marchand?mode=missions", request.url).toString() },
          sendImmediately: true,
        }).catch(() => false) : false,
        order?.buyer_id ? enqueueEmail(admin, {
          dedupeKey: `delivery-failed:${id}:buyer`,
          template: "delivery_failed_buyer",
          recipientUserId: order.buyer_id,
          payload: { orderCode: order.public_code, shopName: merchant?.public_name, url: new URL(`/commandes/${delivery.order_id}`, request.url).toString() },
          sendImmediately: true,
        }).catch(() => false) : false,
      ]);
      await admin.from("audit_events").insert({
        actor_id: user.id,
        merchant_id: delivery.merchant_id,
        action: "delivery.failure.reported",
        entity_type: "delivery",
        entity_id: id,
        request_id: requestId,
        metadata: { reason: input.failureReason, details: input.note, reprogrammable: true },
      });
      return apiSuccess({ ...(data as object), reprogrammable: true }, { requestId });
    }

    const { data, error: updateError } = await admin
      .from("deliveries")
      .update({
        status: input.status,
        failure_reason: null,
        terminal_at: input.status === "cancelled" ? new Date().toISOString() : null,
      })
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
      metadata: {},
    });
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
