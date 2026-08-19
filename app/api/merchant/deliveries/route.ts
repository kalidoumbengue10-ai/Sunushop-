import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireFulfillment } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { deriveDeliveryCode, hashDeliveryCode } from "@/lib/domain/delivery-code";
import { deliveryAssignmentSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    await requireFulfillment(merchantId);
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("deliveries")
      .select("id, order_id, status, assigned_at, pickup_snapshot, pickup_verified_at, delivered_at, terminal_at, failure_reason, pickup_code_attempts, code_attempt_limit, gross_delivery_fee_xof, courier_fee_xof, courier_payable_xof, courier_payment_status, courier_payout_id, platform_commission_rate_bps, platform_commission_xof, commission_status, courier_memberships!inner(id, display_name, phone), orders!inner(public_code, merchant_sequence, created_at, status, recipient_snapshot, delivery_fee_xof, order_items(product_snapshot, sku_snapshot, quantity))")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const items = (data ?? []).map((delivery) => ({
      ...delivery,
      pickupLocked: delivery.pickup_code_attempts >= delivery.code_attempt_limit,
    }));
    return apiSuccess({
      items,
      stats: {
        active: items.filter((item) => !["delivered", "failed", "cancelled"].includes(item.status)).length,
        deliveredThisMonth: items.filter((item) => {
          if (item.status !== "delivered" || !item.delivered_at) return false;
          const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
          return new Date(item.delivered_at) >= start;
        }).length,
        grossDeliveryFeesXof: items.filter((item) => item.status === "delivered").reduce((sum, item) => sum + item.gross_delivery_fee_xof, 0),
        platformCommissionXof: items.reduce((sum, item) => sum + item.platform_commission_xof, 0),
      },
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = deliveryAssignmentSchema.parse(await request.json());
    const admin = requireAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, merchant_id, status, public_code, delivery_fee_xof, recipient_snapshot, delivery_snapshot, merchant_accounts!inner(public_name, region, city, address_hint, phone, pickup_address_line, pickup_latitude, pickup_longitude, pickup_hours, pickup_instructions)")
      .eq("id", input.orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
    const user = await requireFulfillment(order.merchant_id);
    const { data: courier, error: courierError } = await admin
      .from("courier_memberships")
      .select("id, merchant_id, courier_user_id, status")
      .eq("id", input.courierMembershipId)
      .eq("merchant_id", order.merchant_id)
      .eq("status", "active")
      .maybeSingle();
    if (courierError) throw courierError;
    if (!courier) throw new ApiError(404, "COURIER_NOT_FOUND", "Livreur introuvable.");
    const deliverySnapshot = order.delivery_snapshot as Record<string, unknown>;
    const zoneId = typeof deliverySnapshot.zoneId === "string" ? deliverySnapshot.zoneId : "";
    const { data: zone, error: zoneError } = await admin
      .from("delivery_zones")
      .select("courier_fee_xof")
      .eq("id", zoneId)
      .eq("merchant_id", order.merchant_id)
      .maybeSingle();
    if (zoneError) throw zoneError;
    if (!zone || zone.courier_fee_xof == null) {
      throw new ApiError(409, "COURIER_FEE_NOT_CONFIGURED", "Fixez d’abord la rémunération du livreur pour cette zone.");
    }

    const { data: existing } = await admin.from("deliveries").select("id, status, courier_membership_id").eq("order_id", order.id).maybeSingle();
    if (existing) {
      if (!["assigned", "accepted", "at_pickup"].includes(existing.status)) {
        throw new ApiError(409, "DELIVERY_TRANSITION_NOT_ALLOWED", "Réaffectation impossible après retrait.");
      }
      const { data, error } = await admin
        .from("deliveries")
        .update({ courier_membership_id: courier.id, status: "assigned", assigned_by: user.id, assigned_at: new Date().toISOString(), pickup_code_attempts: 0, courier_fee_xof: zone.courier_fee_xof, courier_payable_xof: 0, courier_payment_status: "not_due", courier_payout_id: null, terminal_at: null })
        .eq("id", existing.id)
        .select("id, status")
        .single();
      if (error) throw error;
      await admin.from("delivery_events").insert({
        delivery_id: existing.id,
        merchant_id: order.merchant_id,
        actor_id: user.id,
        from_status: existing.status,
        to_status: "assigned",
        public_message: "La livraison a été réaffectée.",
        metadata: { previousCourierMembershipId: existing.courier_membership_id, courierMembershipId: courier.id },
      });
      if (courier.courier_user_id) {
        await enqueueEmail(admin, { dedupeKey: `delivery-assigned:${data.id}:${courier.id}`, template: "delivery_assigned", recipientUserId: courier.courier_user_id, payload: { orderCode: order.public_code, url: new URL("/marchand?mode=missions", request.url).toString() } }).catch(() => false);
      }
      return apiSuccess(data, { requestId });
    }
    if (order.status !== "ready_for_handoff") {
      throw new ApiError(409, "ORDER_TRANSITION_NOT_ALLOWED", "La commande doit être prête avant affectation.");
    }
    const id = crypto.randomUUID();
    const merchant = Array.isArray(order.merchant_accounts) ? order.merchant_accounts[0] : order.merchant_accounts;
    const pickupCode = deriveDeliveryCode(id, "pickup");
    const recipientCode = deriveDeliveryCode(id, "recipient");
    const { data, error } = await admin
      .from("deliveries")
      .insert({
        id,
        order_id: order.id,
        merchant_id: order.merchant_id,
        courier_membership_id: courier.id,
        pickup_snapshot: {
          name: merchant?.public_name,
          phone: merchant?.phone,
          region: merchant?.region,
          city: merchant?.city,
          addressHint: merchant?.pickup_address_line ?? merchant?.address_hint,
          latitude: merchant?.pickup_latitude,
          longitude: merchant?.pickup_longitude,
          hours: merchant?.pickup_hours,
          instructions: merchant?.pickup_instructions,
        },
        pickup_code_hash: hashDeliveryCode(pickupCode),
        recipient_code_hash: hashDeliveryCode(recipientCode),
        gross_delivery_fee_xof: order.delivery_fee_xof,
        courier_fee_xof: zone.courier_fee_xof,
        platform_commission_rate_bps: 0,
        platform_commission_xof: 0,
        commission_status: "disabled",
        assigned_by: user.id,
      })
      .select("id, status")
      .single();
    if (error) throw error;
    await admin.from("delivery_events").insert({
      delivery_id: id,
      merchant_id: order.merchant_id,
      actor_id: user.id,
      to_status: "assigned",
      public_message: "Un livreur a été affecté à la commande.",
    });
    if (courier.courier_user_id) {
      await enqueueEmail(admin, { dedupeKey: `delivery-assigned:${id}:${courier.id}`, template: "delivery_assigned", recipientUserId: courier.courier_user_id, payload: { orderCode: order.public_code, url: new URL("/marchand?mode=missions", request.url).toString() } }).catch(() => false);
    }
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
