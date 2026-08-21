import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { anonymizeCompletedDelivery } from "@/lib/domain/delivery";
import { deriveDeliveryCode } from "@/lib/domain/delivery-code";

const statuses = new Set(["assigned", "accepted", "at_pickup", "picked_up", "in_transit", "delivered", "failed", "cancelled"]);
const emptyStats = { upcoming: 0, active: 0, deliveredThisMonth: 0, deliveredTotal: 0, failedTotal: 0, dueXof: 0, paidThisMonthXof: 0 };

type DashboardAggregates = {
  stats: typeof emptyStats;
  shopStats: Array<{ membershipId: string; merchantId: string; shopName: string; active: number; delivered: number; failed: number; dueXof: number; paidXof: number }>;
};

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Math.min(10_000, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") ?? "30", 10) || 30));
    const status = url.searchParams.get("status");
    if (status && status !== "all" && !statuses.has(status)) {
      throw new ApiError(422, "DELIVERY_STATUS_INVALID", "Ce filtre de livraison est invalide.");
    }

    const { user, supabase } = await requireUser();
    const admin = requireAdminClient();
    const { data: memberships, error: membershipError } = await admin
      .from("courier_memberships")
      .select("id, merchant_id, display_name, email, phone, vehicle_type, vehicle_registration, photo_storage_path, status, wave_payment_number, orange_money_payment_number, preferred_payment_channel, merchant_accounts!inner(public_name, slug)")
      .eq("courier_user_id", user.id);
    if (membershipError) throw membershipError;
    const membershipIds = (memberships ?? []).map((item) => item.id);
    if (!membershipIds.length) {
      return apiSuccess({
        memberships: [], items: [], payouts: [], shopStats: [], stats: emptyStats,
        pagination: { page, limit, total: 0, totalPages: 0 },
      }, { requestId });
    }

    let deliveryQuery = admin
      .from("deliveries")
      .select("id, merchant_id, courier_membership_id, status, pickup_snapshot, assigned_at, pickup_verified_at, delivered_at, terminal_at, failure_reason, gross_delivery_fee_xof, courier_fee_xof, courier_payable_xof, courier_payment_status, courier_payout_id, orders!inner(public_code, merchant_sequence, created_at, recipient_snapshot, delivery_fee_xof, order_items(product_snapshot, sku_snapshot, quantity, unit_price_xof, line_total_xof))", { count: "exact" })
      .in("courier_membership_id", membershipIds)
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (status && status !== "all") deliveryQuery = deliveryQuery.eq("status", status);

    const [
      { data: deliveries, error: deliveryError, count },
      { data: disputes, error: disputeError },
      { data: payouts, error: payoutError },
      { data: aggregateData, error: aggregateError },
    ] = await Promise.all([
      deliveryQuery,
      admin.from("delivery_disputes").select("id, delivery_id, reason, status, opened_at").in("courier_membership_id", membershipIds).eq("status", "open"),
      admin.from("courier_payouts").select("id, merchant_id, courier_membership_id, amount_xof, payment_method, external_reference, destination_number, paid_at, status, reviewed_at, contest_reason, voided_at, courier_payout_deliveries(amount_xof, delivery_id, deliveries!inner(orders!inner(public_code, merchant_sequence)))").in("courier_membership_id", membershipIds).order("paid_at", { ascending: false }).limit(200),
      (supabase as any).rpc("courier_delivery_dashboard_stats"),
    ]);
    if (deliveryError) throw deliveryError;
    if (disputeError) throw disputeError;
    if (payoutError) throw payoutError;
    if (aggregateError) throw aggregateError;

    const aggregates = (aggregateData ?? { stats: emptyStats, shopStats: [] }) as DashboardAggregates;
    const openDisputeByDelivery = new Map((disputes ?? []).map((item) => [item.delivery_id, item]));
    const membershipById = new Map((memberships ?? []).map((item) => [item.id, item]));
    const items = (deliveries ?? []).map((delivery) => {
      const order = Array.isArray(delivery.orders) ? delivery.orders[0] : delivery.orders;
      const dispute = openDisputeByDelivery.get(delivery.id) ?? null;
      const membership = membershipById.get(delivery.courier_membership_id);
      const shop = membership
        ? Array.isArray(membership.merchant_accounts) ? membership.merchant_accounts[0] : membership.merchant_accounts
        : null;
      const detailed = {
        ...delivery,
        orders: undefined,
        publicCode: order?.public_code,
        merchantSequence: order?.merchant_sequence,
        orderCreatedAt: order?.created_at,
        deliveryFeeXof: order?.delivery_fee_xof,
        orderItems: order?.order_items ?? [],
        shop: shop ? { name: shop.public_name, slug: shop.slug } : null,
        pickupCode: ["assigned", "accepted", "at_pickup"].includes(delivery.status) ? deriveDeliveryCode(delivery.id, "pickup") : null,
        recipient: order?.recipient_snapshot as Record<string, unknown>,
        dispute,
        reprogrammable: delivery.status === "failed",
      };
      return anonymizeCompletedDelivery(detailed, { allowTerminalDetails: Boolean(dispute) });
    });

    const membershipsWithPhotos = await Promise.all((memberships ?? []).map(async (membership) => ({
      ...membership,
      photoUrl: membership.photo_storage_path
        ? (await admin.storage.from("courier-profiles").createSignedUrl(membership.photo_storage_path, 3600)).data?.signedUrl ?? null
        : null,
    })));
    const total = count ?? 0;
    return apiSuccess({
      memberships: membershipsWithPhotos,
      items,
      payouts: payouts ?? [],
      shopStats: aggregates.shopStats ?? [],
      stats: aggregates.stats ?? emptyStats,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
