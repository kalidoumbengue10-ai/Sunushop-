import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireFulfillment } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/api/security";
import { hasCoordinatePair } from "@/lib/domain/geo";
import { deliveryOfferSchema } from "@/lib/domain/schemas";
import { calculateRoute } from "@/lib/maps/openroute-service";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    await requireFulfillment(merchantId);
    const admin = requireAdminClient();
    const now = new Date().toISOString();
    const { error: expiryError } = await (admin as any)
      .from("delivery_offers")
      .update({ status: "expired", responded_at: now })
      .eq("merchant_id", merchantId)
      .eq("status", "pending")
      .lte("expires_at", now);
    if (expiryError) throw expiryError;
    const { data, error } = await (admin as any)
      .from("delivery_offers")
      .select("id, status, distance_meters, duration_seconds, client_delivery_fee_xof, courier_fee_xof, created_at, expires_at, responded_at, courier_memberships!inner(id, display_name, phone), orders!inner(public_code, merchant_sequence)")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) { return apiFailure(error, requestId); }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = deliveryOfferSchema.parse(await request.json());
    const admin = requireAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, merchant_id, status, public_code, delivery_fee_xof, recipient_snapshot, merchant_accounts!inner(public_name, email, owner_user_id, pickup_latitude, pickup_longitude)")
      .eq("id", input.orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
    const user = await requireFulfillment(order.merchant_id);
    const { data: courier, error: courierError } = await admin
      .from("courier_memberships")
      .select("id, courier_user_id, email, status, courier_profile_id")
      .eq("id", input.courierMembershipId)
      .eq("merchant_id", order.merchant_id)
      .in("status", ["pending_invitation", "active"])
      .maybeSingle();
    if (courierError) throw courierError;
    if (!courier) throw new ApiError(404, "COURIER_NOT_FOUND", "Livreur introuvable.");

    const { data: existingDelivery } = await admin.from("deliveries").select("id, status").eq("order_id", order.id).in("status", ["assigned", "accepted", "at_pickup", "picked_up", "in_transit"]).maybeSingle();
    if (existingDelivery && !["assigned", "accepted", "at_pickup"].includes(existingDelivery.status)) {
      throw new ApiError(409, "DELIVERY_TRANSITION_NOT_ALLOWED", "Cette livraison a déjà commencé.");
    }
    const merchant = Array.isArray(order.merchant_accounts) ? order.merchant_accounts[0] : order.merchant_accounts;
    const recipient = order.recipient_snapshot as Record<string, unknown>;
    const origin = { latitude: Number(merchant?.pickup_latitude), longitude: Number(merchant?.pickup_longitude) };
    const destination = { latitude: Number(recipient?.latitude), longitude: Number(recipient?.longitude) };
    if (!hasCoordinatePair(origin) || !hasCoordinatePair(destination)) {
      throw new ApiError(422, "DELIVERY_ROUTE_COORDINATES_MISSING", "Ajoutez les positions exactes du retrait et du client avant l’affectation.");
    }
    await Promise.all([
      enforceRateLimit({ key: user.id, action: "maps.route.merchant", windowSeconds: 60, maxRequests: 20 }),
      enforceRateLimit({ key: "global", action: "maps.route.global.minute", windowSeconds: 60, maxRequests: 30 }),
    ]);
    const route = await calculateRoute(origin, destination);

    const { data: offer, error: offerError } = await (admin as any)
      .from("delivery_offers")
      .upsert({
        merchant_id: order.merchant_id,
        order_id: order.id,
        courier_membership_id: courier.id,
        distance_meters: Math.max(1, Math.round(route.distanceMeters)),
        duration_seconds: Math.max(1, Math.round(route.durationSeconds)),
        client_delivery_fee_xof: order.delivery_fee_xof,
        courier_fee_xof: input.courierFeeXof,
        route_snapshot: route,
        idempotency_key: input.idempotencyKey,
        created_by: user.id,
      }, { onConflict: "merchant_id,idempotency_key" })
      .select("id, status, distance_meters, duration_seconds, courier_fee_xof, expires_at")
      .single();
    if (offerError) throw offerError;

    let url = new URL("/marchand?mode=missions", request.url).toString();
    if (courier.status === "pending_invitation") {
      const { data: invitation } = await (admin as any)
        .from("workspace_invitations")
        .select("id")
        .eq("courier_membership_id", courier.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (invitation) {
        const { data: notification } = await admin.from("notification_outbox").select("payload").eq("dedupe_key", `courier-invitation:${invitation.id}`).maybeSingle();
        const invitationUrl = (notification?.payload as { url?: string } | null)?.url;
        if (invitationUrl) url = invitationUrl;
      }
    }
    if (courier.email) {
      await enqueueEmail(admin, {
        dedupeKey: `delivery-offer:${offer.id}`,
        template: "delivery_offer",
        to: courier.email,
        recipientUserId: courier.courier_user_id,
        payload: {
          orderCode: order.public_code,
          shopName: merchant?.public_name,
          zone: String(recipient?.city ?? recipient?.region ?? "Zone indiquée"),
          distanceLabel: `${(offer.distance_meters / 1000).toFixed(1)} km`,
          durationLabel: `${Math.max(1, Math.round(offer.duration_seconds / 60))} min`,
          courierFeeXof: offer.courier_fee_xof,
          url,
        },
        sendImmediately: true,
      }).catch(() => false);
    }
    await admin.from("audit_events").insert({ actor_id: user.id, merchant_id: order.merchant_id, action: "delivery.offer.create", entity_type: "delivery_offer", entity_id: offer.id, request_id: requestId, metadata: { orderId: order.id, courierMembershipId: courier.id, distanceMeters: offer.distance_meters, courierFeeXof: offer.courier_fee_xof } });
    return apiSuccess({ ...offer, invitationUrl: url }, { status: 201, requestId });
  } catch (error) { return apiFailure(error, requestId); }
}
