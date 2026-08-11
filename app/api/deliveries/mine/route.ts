import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { anonymizeCompletedDelivery } from "@/lib/domain/delivery";
import { deriveDeliveryCode } from "@/lib/domain/delivery-code";

const terminalStatuses = new Set(["delivered", "failed", "cancelled"]);

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: memberships, error: membershipError } = await admin
      .from("courier_memberships")
      .select("id, merchant_id, display_name, email, phone, vehicle_type, vehicle_registration, photo_storage_path, status, wave_payment_number, orange_money_payment_number, preferred_payment_channel, merchant_accounts!inner(public_name, slug)")
      .eq("courier_user_id", user.id);
    if (membershipError) throw membershipError;
    const membershipIds = (memberships ?? []).map((item) => item.id);
    if (!membershipIds.length) {
      return apiSuccess({
        memberships: [], items: [], payouts: [], shopStats: [],
        stats: { upcoming: 0, active: 0, deliveredThisMonth: 0, deliveredTotal: 0, failedTotal: 0, dueXof: 0, paidThisMonthXof: 0 },
      }, { requestId });
    }

    const [{ data: deliveries, error: deliveryError }, { data: disputes, error: disputeError }, { data: payouts, error: payoutError }] = await Promise.all([
      admin
        .from("deliveries")
        .select("id, merchant_id, courier_membership_id, status, pickup_snapshot, assigned_at, pickup_verified_at, delivered_at, terminal_at, failure_reason, gross_delivery_fee_xof, courier_fee_xof, courier_payable_xof, courier_payment_status, courier_payout_id, orders!inner(public_code, merchant_sequence, created_at, recipient_snapshot, delivery_fee_xof, order_items(product_snapshot, sku_snapshot, quantity, unit_price_xof, line_total_xof))")
        .in("courier_membership_id", membershipIds)
        .order("created_at", { ascending: false })
        .limit(300),
      admin
        .from("delivery_disputes")
        .select("id, delivery_id, reason, status, opened_at")
        .in("courier_membership_id", membershipIds)
        .eq("status", "open"),
      admin
        .from("courier_payouts")
        .select("id, merchant_id, courier_membership_id, amount_xof, payment_method, external_reference, destination_number, paid_at, status, reviewed_at, contest_reason, voided_at, courier_payout_deliveries(amount_xof, delivery_id, deliveries!inner(orders!inner(public_code, merchant_sequence)))")
        .in("courier_membership_id", membershipIds)
        .order("paid_at", { ascending: false }),
    ]);
    if (deliveryError) throw deliveryError;
    if (disputeError) throw disputeError;
    if (payoutError) throw payoutError;

    const openDisputeByDelivery = new Map((disputes ?? []).map((item) => [item.delivery_id, item]));
    const membershipById = new Map((memberships ?? []).map((item) => [item.id, item]));
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

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
        pickupCode: ["assigned", "accepted", "at_pickup"].includes(delivery.status)
          ? deriveDeliveryCode(delivery.id, "pickup")
          : null,
        recipient: order?.recipient_snapshot as Record<string, unknown>,
        dispute,
      };
      return anonymizeCompletedDelivery(detailed, { allowTerminalDetails: Boolean(dispute) });
    });

    const shopStats = (memberships ?? []).map((membership) => {
      const membershipDeliveries = items.filter((item) => item.courier_membership_id === membership.id);
      const membershipPayouts = (payouts ?? []).filter((item) => item.courier_membership_id === membership.id && item.status === "confirmed");
      const shop = Array.isArray(membership.merchant_accounts) ? membership.merchant_accounts[0] : membership.merchant_accounts;
      return {
        membershipId: membership.id,
        merchantId: membership.merchant_id,
        shopName: shop?.public_name ?? "Boutique",
        active: membershipDeliveries.filter((item) => !terminalStatuses.has(item.status)).length,
        delivered: membershipDeliveries.filter((item) => item.status === "delivered").length,
        failed: membershipDeliveries.filter((item) => item.status === "failed").length,
        dueXof: membershipDeliveries.filter((item) => item.courier_payment_status === "due").reduce((sum, item) => sum + item.courier_payable_xof, 0),
        paidXof: membershipPayouts.reduce((sum, item) => sum + item.amount_xof, 0),
      };
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
      payouts: payouts ?? [],
      shopStats,
      stats: {
        upcoming: items.filter((item) => ["assigned", "accepted", "at_pickup"].includes(item.status)).length,
        active: items.filter((item) => ["picked_up", "in_transit"].includes(item.status)).length,
        deliveredThisMonth: items.filter((item) => item.status === "delivered" && item.delivered_at && new Date(item.delivered_at) >= monthStart).length,
        deliveredTotal: items.filter((item) => item.status === "delivered").length,
        failedTotal: items.filter((item) => item.status === "failed").length,
        dueXof: items.filter((item) => item.courier_payment_status === "due").reduce((sum, item) => sum + item.courier_payable_xof, 0),
        paidThisMonthXof: (payouts ?? []).filter((item) => item.status === "confirmed" && new Date(item.paid_at) >= monthStart).reduce((sum, item) => sum + item.amount_xof, 0),
      },
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
