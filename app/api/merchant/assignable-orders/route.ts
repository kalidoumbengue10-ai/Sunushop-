import { requireAdminClient } from "@/lib/api/auth";
import { requireFulfillment } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { ASSIGNABLE_ORDER_STATUSES, assignableOrderLabel, assignableOrderReason, isReadyForAssignment, isVisibleInAssignmentQueue } from "@/lib/domain/courier-assignment";

const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? (value[0] ?? null) : value);

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

    const { data, error } = await admin
      .from("orders")
      .select("id, public_code, merchant_sequence, status, payment_status, delivery_fee_xof, created_at, delivery_snapshot, recipient_snapshot, deliveries(id, status)")
      .eq("merchant_id", merchantId)
      .in("status", ASSIGNABLE_ORDER_STATUSES as unknown as string[])
      .order("created_at", { ascending: false });
    if (error) throw error;
    const orderIds = (data ?? []).map((order) => order.id);
    const { data: offers, error: offerError } = orderIds.length
      ? await (admin as any).from("delivery_offers").select("order_id, status").in("order_id", orderIds)
      : { data: [], error: null };
    if (offerError) throw offerError;
    const offeredOrderIds = new Set<string>((offers ?? [])
      .filter((offer: { status: string }) => offer.status === "pending")
      .map((offer: { order_id: string }) => offer.order_id));
    const previouslyOfferedOrderIds = new Set<string>((offers ?? [])
      .filter((offer: { status: string }) => offer.status !== "pending")
      .map((offer: { order_id: string }) => offer.order_id));

    const items: Array<{
      id: string;
      publicCode: string;
      merchantSequence: number;
      status: string;
      ready: boolean;
      label: string;
      reassignment: boolean;
      recipientName: string;
      city: string;
      deliveryFeeXof: number;
    }> = [];
    let excludedPickup = 0;
    let excludedLocked = 0;

    for (const order of data ?? []) {
      // Une commande directe non payée reste dans le suivi client, mais ne doit
      // pas encombrer la file d'affectation du marchand.
      if (!isVisibleInAssignmentQueue(order.status, order.payment_status)) continue;
      if (offeredOrderIds.has(order.id)) { excludedLocked += 1; continue; }
      const delivery = Array.isArray(order.deliveries)
        ? order.deliveries.find((item) => ["assigned", "accepted", "at_pickup", "picked_up", "in_transit"].includes(item.status)) ?? null
        : order.deliveries;
      const reason = assignableOrderReason({
        status: order.status,
        deliverySnapshot: order.delivery_snapshot as { methodKind?: string | null; zoneId?: string | null } | null,
        delivery: delivery ? { status: delivery.status } : null,
      });
      if (reason === "pickup_order") { excludedPickup += 1; continue; }
      if (reason === "delivery_locked") { excludedLocked += 1; continue; }
      if (reason !== "assignable") continue;
      const recipient = order.recipient_snapshot as Record<string, unknown> | null;
      items.push({
        id: order.id,
        publicCode: order.public_code,
        merchantSequence: order.merchant_sequence,
        status: order.status,
        ready: isReadyForAssignment({
          status: order.status,
          deliverySnapshot: order.delivery_snapshot as { methodKind?: string | null; zoneId?: string | null } | null,
          delivery: delivery ? { status: delivery.status } : null,
        }),
        label: assignableOrderLabel(order.status, order.payment_status),
        reassignment: Boolean(delivery) || previouslyOfferedOrderIds.has(order.id),
        recipientName: String(recipient?.name ?? ""),
        city: String(recipient?.city ?? ""),
        deliveryFeeXof: order.delivery_fee_xof,
      });
    }

    return apiSuccess({ items, excluded: { pickup: excludedPickup, locked: excludedLocked } }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
