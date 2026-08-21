import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { deriveDeliveryCode, hashDeliveryCode } from "@/lib/domain/delivery-code";
import { deliveryOfferDecisionSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = deliveryOfferDecisionSchema.parse(await request.json());
    const { user, supabase } = await requireUser();
    const admin = requireAdminClient();
    const { data: offer, error } = await (admin as any)
      .from("delivery_offers")
      .select("*, courier_memberships!inner(id, courier_user_id, status), orders!inner(id, status, public_code, recipient_snapshot, merchant_accounts!inner(public_name, phone, region, city, address_hint, pickup_address_line, pickup_latitude, pickup_longitude, pickup_hours, pickup_instructions, email, owner_user_id))")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const membership = offer && (Array.isArray(offer.courier_memberships) ? offer.courier_memberships[0] : offer.courier_memberships);
    if (!offer || membership?.courier_user_id !== user.id) throw new ApiError(404, "DELIVERY_OFFER_NOT_FOUND", "Cette proposition est introuvable.");
    if (offer.status === "pending" && new Date(offer.expires_at).getTime() <= Date.now()) {
      await (admin as any).from("delivery_offers").update({ status: "expired", responded_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
      throw new ApiError(410, "DELIVERY_OFFER_EXPIRED", "Cette proposition a expiré. Le marchand peut en créer une nouvelle.");
    }
    if (offer.status !== "pending") {
      const { data: existing } = await admin.from("deliveries").select("id, status").eq("delivery_offer_id", id).maybeSingle();
      if (input.decision === "accept" && existing) return apiSuccess({ offerId: id, deliveryId: existing.id, status: existing.status }, { requestId });
      throw new ApiError(409, "DELIVERY_OFFER_ALREADY_ANSWERED", "Cette proposition a déjà reçu une réponse.");
    }

    if (input.decision === "decline") {
      const { error: declineError } = await (admin as any).from("delivery_offers").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
      if (declineError) throw declineError;
      await admin.from("audit_events").insert({ actor_id: user.id, merchant_id: offer.merchant_id, action: "delivery.offer.decline", entity_type: "delivery_offer", entity_id: id, request_id: requestId, metadata: { orderId: offer.order_id } });
      const declinedOrder = Array.isArray(offer.orders) ? offer.orders[0] : offer.orders;
      const declinedMerchant = declinedOrder && (Array.isArray(declinedOrder.merchant_accounts) ? declinedOrder.merchant_accounts[0] : declinedOrder.merchant_accounts);
      if (declinedMerchant?.email) await enqueueEmail(admin, { dedupeKey: `delivery-offer-declined:${id}`, template: "delivery_offer_declined", to: declinedMerchant.email, recipientUserId: declinedMerchant.owner_user_id, payload: { orderCode: declinedOrder.public_code, url: new URL("/marchand", request.url).toString() }, sendImmediately: true }).catch(() => false);
      return apiSuccess({ offerId: id, status: "declined" }, { requestId });
    }

    const order = Array.isArray(offer.orders) ? offer.orders[0] : offer.orders;
    if (order?.status !== "ready_for_handoff") throw new ApiError(409, "ORDER_TRANSITION_NOT_ALLOWED", "La commande n’est plus prête à être affectée.");
    const merchant = Array.isArray(order.merchant_accounts) ? order.merchant_accounts[0] : order.merchant_accounts;
    const deliveryId = crypto.randomUUID();
    const pickupCode = deriveDeliveryCode(deliveryId, "pickup");
    const recipientCode = deriveDeliveryCode(deliveryId, "recipient");
    const { data: acceptedDeliveryId, error: acceptError } = await (supabase as any).rpc("accept_delivery_offer", {
      p_offer_id: id,
      p_delivery_id: deliveryId,
      p_pickup_code_hash: hashDeliveryCode(pickupCode),
      p_recipient_code_hash: hashDeliveryCode(recipientCode),
    });
    if (acceptError) {
      if (String(acceptError.message).includes("DELIVERY_OFFER_EXPIRED")) {
        await (admin as any).from("delivery_offers").update({ status: "expired", responded_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
        throw new ApiError(410, "DELIVERY_OFFER_EXPIRED", "Cette proposition a expiré. Le marchand peut en créer une nouvelle.");
      }
      throw acceptError;
    }
    const finalDeliveryId = String(acceptedDeliveryId ?? deliveryId);
    await admin.from("audit_events").insert({ actor_id: user.id, merchant_id: offer.merchant_id, action: "delivery.offer.accept", entity_type: "delivery_offer", entity_id: id, request_id: requestId, metadata: { orderId: offer.order_id, deliveryId: finalDeliveryId } });
    if (merchant?.email) await enqueueEmail(admin, { dedupeKey: `delivery-offer-accepted:${id}`, template: "delivery_offer_accepted", to: merchant.email, recipientUserId: merchant.owner_user_id, payload: { orderCode: order.public_code, url: new URL("/marchand", request.url).toString() }, sendImmediately: true }).catch(() => false);
    return apiSuccess({ offerId: id, deliveryId: finalDeliveryId, status: "accepted" }, { requestId });
  } catch (error) { return apiFailure(error, requestId); }
}
