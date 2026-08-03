import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { anonymizeCompletedDelivery } from "@/lib/domain/delivery";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: memberships, error: membershipError } = await admin
      .from("courier_memberships")
      .select("id, merchant_id, display_name, phone, merchant_accounts!inner(public_name, slug)")
      .eq("courier_user_id", user.id)
      .eq("status", "active");
    if (membershipError) throw membershipError;
    const ids = (memberships ?? []).map((item) => item.id);
    if (!ids.length) return apiSuccess({ memberships: [], items: [], deliveredThisMonth: 0 }, { requestId });
    const { data, error } = await admin
      .from("deliveries")
      .select("id, merchant_id, courier_membership_id, status, pickup_snapshot, assigned_at, pickup_verified_at, delivered_at, failure_reason, orders!inner(public_code, recipient_snapshot, delivery_fee_xof)")
      .in("courier_membership_id", ids)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const items = (data ?? []).map((item) => {
      const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
      return anonymizeCompletedDelivery({
        ...item,
        orders: undefined,
        publicCode: order?.public_code,
        deliveryFeeXof: order?.delivery_fee_xof,
        recipient: order?.recipient_snapshot as Record<string, unknown>,
      });
    });
    return apiSuccess({
      memberships,
      items,
      deliveredThisMonth: items.filter((item) => item.status === "delivered" && item.delivered_at && new Date(item.delivered_at) >= monthStart).length,
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
