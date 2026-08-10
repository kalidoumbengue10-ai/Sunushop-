import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { anonymizeCompletedDelivery } from "@/lib/domain/delivery";
import { deriveDeliveryCode } from "@/lib/domain/delivery-code";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: memberships, error: membershipError } = await admin
      .from("courier_memberships")
      .select("id, merchant_id, display_name, email, phone, vehicle_type, vehicle_registration, photo_storage_path, status, merchant_accounts!inner(public_name, slug)")
      .eq("courier_user_id", user.id);
    if (membershipError) throw membershipError;
    const ids = (memberships ?? []).map((item) => item.id);
    if (!ids.length) return apiSuccess({ memberships: [], items: [], deliveredThisMonth: 0, deliveredTotal: 0 }, { requestId });
    const { data, error } = await admin
      .from("deliveries")
      .select("id, merchant_id, courier_membership_id, status, pickup_snapshot, assigned_at, pickup_verified_at, delivered_at, failure_reason, gross_delivery_fee_xof, orders!inner(public_code, recipient_snapshot, delivery_fee_xof)")
      .in("courier_membership_id", ids)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const items = (data ?? []).map((item) => {
      const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
      return anonymizeCompletedDelivery({
        ...item,
        orders: undefined,
        publicCode: order?.public_code,
        deliveryFeeXof: order?.delivery_fee_xof,
        pickupCode: ["assigned", "accepted", "at_pickup"].includes(item.status) ? deriveDeliveryCode(item.id, "pickup") : null,
        recipient: order?.recipient_snapshot as Record<string, unknown>,
      });
    });
    const membershipsWithPhotos = await Promise.all((memberships ?? []).map(async (membership) => ({
      ...membership,
      photoUrl: membership.photo_storage_path
        ? (await admin.storage.from("courier-profiles").createSignedUrl(membership.photo_storage_path, 3600)).data?.signedUrl ?? null
        : null,
    })));
    return apiSuccess({
      memberships: membershipsWithPhotos,
      items,
      deliveredThisMonth: items.filter((item) => item.status === "delivered" && item.delivered_at && new Date(item.delivered_at) >= monthStart).length,
      deliveredTotal: items.filter((item) => item.status === "delivered").length,
      failedTotal: items.filter((item) => item.status === "failed").length,
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
