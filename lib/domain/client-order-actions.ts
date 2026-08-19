const BUYER_CANCELLABLE_STATUSES = new Set([
  "pending_seller_confirmation",
  "confirmed",
  "preparing",
]);

const ACTIVE_DELIVERY_STATUSES = new Set([
  "assigned",
  "accepted",
  "at_pickup",
  "picked_up",
  "in_transit",
]);

const UNSETTLED_PAYMENT_STATUSES = new Set([
  "paid",
  "pending_confirmation",
  "refund_pending",
]);

export function canBuyerCancelOrder(status: string, deliveryStatus?: string | null) {
  if (BUYER_CANCELLABLE_STATUSES.has(status)) return true;
  if (status !== "ready_for_handoff") return false;
  return !deliveryStatus || !ACTIVE_DELIVERY_STATUSES.has(deliveryStatus);
}

export function canBuyerHideOrder(status: string, paymentStatus: string) {
  if (status === "delivered") return true;
  return status === "cancelled" && !UNSETTLED_PAYMENT_STATUSES.has(paymentStatus);
}
