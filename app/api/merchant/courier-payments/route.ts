import { requireAdminClient } from "@/lib/api/auth";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { courierPayoutSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    const { admin } = await requireActiveMerchantAccess(merchantId, ["owner", "manager", "fulfillment"]);
    const [{ data: deliveries, error: deliveriesError }, { data: payouts, error: payoutsError }] = await Promise.all([
      admin
        .from("deliveries")
        .select("id, order_id, courier_membership_id, status, delivered_at, terminal_at, courier_fee_xof, courier_payable_xof, courier_payment_status, courier_payout_id, courier_memberships!inner(id, display_name, wave_payment_number, orange_money_payment_number, preferred_payment_channel), orders!inner(public_code, merchant_sequence, created_at)")
        .eq("merchant_id", merchantId)
        .in("courier_payment_status", ["due", "payment_declared", "paid", "waived", "review_required"])
        .order("terminal_at", { ascending: false }),
      admin
        .from("courier_payouts")
        .select("id, courier_membership_id, amount_xof, payment_method, external_reference, destination_number, paid_at, status, reviewed_at, contest_reason, recorded_by, voided_at, voided_by, void_reason, created_at, courier_memberships!inner(display_name), courier_payout_deliveries(amount_xof, delivery_id, deliveries!inner(orders!inner(public_code, merchant_sequence)))")
        .eq("merchant_id", merchantId)
        .order("paid_at", { ascending: false }),
    ]);
    if (deliveriesError) throw deliveriesError;
    if (payoutsError) throw payoutsError;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const courierMonthlyStats = [...new Set((deliveries ?? []).map((item) => item.courier_membership_id))].map((courierId) => {
      const ownDeliveries = (deliveries ?? []).filter((item) => item.courier_membership_id === courierId);
      const ownPayouts = (payouts ?? []).filter((item) => item.courier_membership_id === courierId);
      const membership = ownDeliveries[0]?.courier_memberships;
      const courier = Array.isArray(membership) ? membership[0] : membership;
      return {
        courierMembershipId: courierId,
        displayName: courier?.display_name ?? "Livreur",
        courseCount: ownDeliveries.filter((item) => item.status === "delivered" && item.terminal_at && new Date(item.terminal_at) >= monthStart).length,
        dueXof: ownDeliveries.filter((item) => item.courier_payment_status === "due").reduce((sum, item) => sum + item.courier_payable_xof, 0),
        pendingXof: ownDeliveries.filter((item) => item.courier_payment_status === "payment_declared").reduce((sum, item) => sum + item.courier_payable_xof, 0),
        paidXof: ownPayouts.filter((item) => item.status === "confirmed" && new Date(item.paid_at) >= monthStart).reduce((sum, item) => sum + item.amount_xof, 0),
      };
    });
    return apiSuccess({
      deliveries: deliveries ?? [],
      payouts: payouts ?? [],
      courierMonthlyStats,
      stats: {
        dueXof: (deliveries ?? []).filter((item) => item.courier_payment_status === "due").reduce((sum, item) => sum + item.courier_payable_xof, 0),
        paidThisMonthXof: (payouts ?? []).filter((item) => item.status === "confirmed" && new Date(item.paid_at) >= monthStart).reduce((sum, item) => sum + item.amount_xof, 0),
      },
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = courierPayoutSchema.parse(await request.json());
    const { user } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager"]);
    const admin = requireAdminClient();
    const { data, error } = await admin.rpc("record_courier_payout", {
      p_merchant_id: input.merchantId,
      p_courier_membership_id: input.courierMembershipId,
      p_delivery_ids: input.deliveryIds,
      p_payment_method: input.paymentMethod,
      p_external_reference: input.externalReference ?? "",
      p_paid_at: input.paidAt,
      p_actor_id: user.id,
    });
    if (error) throw error;
    const payout = Array.isArray(data) ? data[0] : data;
    const [{ data: membership }, { data: merchant }] = await Promise.all([
      admin.from("courier_memberships").select("courier_user_id, email").eq("id", input.courierMembershipId).maybeSingle(),
      admin.from("merchant_accounts").select("public_name").eq("id", input.merchantId).maybeSingle(),
    ]);
    if (membership && payout) {
      await enqueueEmail(admin, {
        dedupeKey: `courier-payout-declared:${payout.id}`,
        template: "courier_payout_declared",
        to: membership.email,
        recipientUserId: membership.courier_user_id,
        payload: { shopName: merchant?.public_name, amountXof: payout.amount_xof, paymentMethod: input.paymentMethod, externalReference: input.externalReference, url: new URL("/marchand?mode=missions&tab=paiements", request.url).toString() },
        sendImmediately: true,
      }).catch(() => false);
    }
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
