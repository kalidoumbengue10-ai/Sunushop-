import { requireAdminClient } from "@/lib/api/auth";
import { requireFulfillment } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { ASSIGNABLE_ORDER_STATUSES, assignableOrderLabel, assignableOrderReason } from "@/lib/domain/courier-assignment";

const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? (value[0] ?? null) : value);

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    await requireFulfillment(merchantId);
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("id, public_code, merchant_sequence, status, created_at, delivery_snapshot, recipient_snapshot, deliveries(id, status)")
      .eq("merchant_id", merchantId)
      .in("status", ASSIGNABLE_ORDER_STATUSES as unknown as string[])
      .order("created_at", { ascending: false });
    if (error) throw error;

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
    }> = [];
    let excludedPickup = 0;
    let excludedLocked = 0;

    for (const order of data ?? []) {
      const delivery = one(order.deliveries);
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
        ready: order.status === "ready_for_handoff",
        label: assignableOrderLabel(order.status),
        reassignment: Boolean(delivery),
        recipientName: String(recipient?.name ?? ""),
        city: String(recipient?.city ?? ""),
      });
    }

    return apiSuccess({ items, excluded: { pickup: excludedPickup, locked: excludedLocked } }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
