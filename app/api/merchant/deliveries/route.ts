import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { deriveDeliveryCode, hashDeliveryCode } from "@/lib/domain/delivery-code";
import { deliveryAssignmentSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

async function requireFulfillment(merchantId: string) {
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", merchantId)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "manager", "fulfillment"])
    .maybeSingle();
  if (!data) throw new ApiError(403, "FORBIDDEN", "Accès refusé.");
  const admin = requireAdminClient();
  const { data: merchant, error } = await admin
    .from("merchant_accounts")
    .select("verification_status")
    .eq("id", merchantId)
    .maybeSingle();
  if (error) throw error;
  if (merchant?.verification_status !== "approved") {
    throw new ApiError(403, "KYC_APPROVAL_REQUIRED", "Votre dossier doit être validé avant de gérer des livraisons.");
  }
  return user;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    await requireFulfillment(merchantId);
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("deliveries")
      .select("id, order_id, status, assigned_at, pickup_verified_at, delivered_at, failure_reason, courier_memberships!inner(id, display_name, phone), orders!inner(public_code, status, recipient_snapshot, delivery_fee_xof)")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return apiSuccess({
      items: (data ?? []).map((delivery) => ({
        ...delivery,
        pickupCode: ["assigned", "accepted", "at_pickup"].includes(delivery.status)
          ? deriveDeliveryCode(delivery.id, "pickup")
          : null,
      })),
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
      .select("id, merchant_id, status, public_code, recipient_snapshot, delivery_snapshot, merchant_accounts!inner(public_name, region, city, address_hint, phone)")
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

    const { data: existing } = await admin
      .from("deliveries")
      .select("id, status, courier_membership_id")
      .eq("order_id", order.id)
      .maybeSingle();
    if (existing) {
      if (!["assigned", "accepted", "at_pickup"].includes(existing.status)) {
        throw new ApiError(409, "DELIVERY_TRANSITION_NOT_ALLOWED", "Réaffectation impossible après retrait.");
      }
      const { data, error } = await admin
        .from("deliveries")
        .update({ courier_membership_id: courier.id, status: "assigned", assigned_by: user.id, assigned_at: new Date().toISOString() })
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
      await enqueueEmail(admin, { dedupeKey: `delivery-assigned:${data.id}:${courier.id}`, template: "delivery_assigned", recipientUserId: courier.courier_user_id, payload: { orderCode: order.public_code, url: new URL("/marchand", request.url).toString() } }).catch(() => false);
      return apiSuccess({ ...data, pickupCode: deriveDeliveryCode(data.id, "pickup") }, { requestId });
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
          addressHint: merchant?.address_hint,
        },
        pickup_code_hash: hashDeliveryCode(pickupCode),
        recipient_code_hash: hashDeliveryCode(recipientCode),
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
    await enqueueEmail(admin, { dedupeKey: `delivery-assigned:${id}:${courier.id}`, template: "delivery_assigned", recipientUserId: courier.courier_user_id, payload: { orderCode: order.public_code, url: new URL("/marchand", request.url).toString() } }).catch(() => false);
    return apiSuccess({ ...data, pickupCode }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
