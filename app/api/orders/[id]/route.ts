import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const [
      { data: order, error: orderError },
      { data: items, error: itemsError },
      { data: events, error: eventsError },
      { data: paymentDeclarations, error: paymentDeclarationsError },
    ] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, batch_id, buyer_id, merchant_id, public_code, status, payment_method, subtotal_xof, delivery_fee_xof, total_xof, delivery_snapshot, recipient_snapshot, payment_instructions_snapshot, created_at, updated_at, merchant_accounts!inner(public_name, slug)",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("order_items")
        .select(
          "id, product_snapshot, sku_snapshot, unit_price_xof, quantity, line_total_xof",
        )
        .eq("order_id", id),
      supabase
        .from("order_events")
        .select(
          "id, from_status, to_status, public_message, created_at",
        )
        .eq("order_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("direct_payment_declarations")
        .select(
          "id, channel, external_reference, amount_xof, declared_at, confirmed_by_merchant_at",
        )
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (orderError) throw orderError;
    if (itemsError) throw itemsError;
    if (eventsError) throw eventsError;
    if (paymentDeclarationsError) throw paymentDeclarationsError;
    return apiSuccess(
      { order, items, events, paymentDeclarations },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
