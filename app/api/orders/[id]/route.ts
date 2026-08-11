import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { deriveDeliveryCode } from "@/lib/domain/delivery-code";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const db = supabase as any;
    const [
      { data: order, error: orderError },
      { data: items, error: itemsError },
      { data: events, error: eventsError },
      { data: paymentDeclarations, error: paymentDeclarationsError },
      { data: delivery, error: deliveryError },
      { data: refunds, error: refundError },
      { data: orderDisputes, error: orderDisputeError },
      { data: deliveryDisputes, error: deliveryDisputesError },
    ] = await Promise.all([
      db.from("orders").select("id, batch_id, buyer_id, merchant_id, public_code, status, payment_method, payment_status, subtotal_xof, delivery_fee_xof, total_xof, loyalty_points_redeemed, loyalty_discount_xof, loyalty_points_earned, delivery_snapshot, recipient_snapshot, payment_instructions_snapshot, created_at, updated_at").eq("id", id).single(),
      db.from("order_items").select("id, product_snapshot, sku_snapshot, unit_price_xof, quantity, line_total_xof").eq("order_id", id),
      db.from("order_events").select("id, from_status, to_status, public_message, created_at").eq("order_id", id).order("created_at", { ascending: true }),
      db.from("direct_payment_declarations").select("id, channel, external_reference, amount_xof, declared_at, status, reviewed_at, rejection_reason, confirmed_by_merchant_at").eq("order_id", id).order("created_at", { ascending: false }),
      db.from("deliveries").select("id, status, pickup_verified_at, delivered_at").eq("order_id", id).maybeSingle(),
      db.from("order_refunds").select("id, amount_xof, channel, external_reference, destination_number, status, declared_at, reviewed_at, contest_reason").eq("order_id", id).order("created_at", { ascending: false }),
      db.from("order_disputes").select("id, reason, status, resolution, resolution_note, opened_at, resolved_at").eq("order_id", id).order("opened_at", { ascending: false }),
      db.from("delivery_disputes").select("id, delivery_id, reason, status, resolution, opened_at, resolved_at, delivery_dispute_events(id, event_type, message, created_at)").eq("order_id", id).order("opened_at", { ascending: false }),
    ]);
    for (const error of [orderError, itemsError, eventsError, paymentDeclarationsError, deliveryError, refundError, orderDisputeError, deliveryDisputesError]) {
      if (error) throw error;
    }
    const { data: merchant, error: merchantError } = await requireAdminClient()
      .from("merchant_accounts").select("public_name, slug, phone, email").eq("id", order.merchant_id).single();
    if (merchantError) throw merchantError;
    return apiSuccess({
      order: { ...order, merchant_accounts: merchant },
      items,
      events,
      paymentDeclarations,
      refunds: refunds ?? [],
      orderDisputes: orderDisputes ?? [],
      delivery: delivery ? {
        ...delivery,
        recipientCode: order.buyer_id === user.id && ["picked_up", "in_transit"].includes(delivery.status)
          ? deriveDeliveryCode(delivery.id, "recipient") : null,
      } : null,
      deliveryDisputes: deliveryDisputes ?? [],
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
