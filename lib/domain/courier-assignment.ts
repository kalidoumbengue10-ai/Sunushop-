export const ASSIGNABLE_ORDER_STATUSES = [
  "pending_seller_confirmation",
  "confirmed",
  "preparing",
  "ready_for_handoff",
] as const;

const REASSIGNABLE_DELIVERY_STATUSES = new Set(["assigned", "accepted", "at_pickup"]);

export type AssignableOrderInput = {
  status: string;
  deliverySnapshot: { methodKind?: string | null; zoneId?: string | null } | null;
  delivery: { status: string } | null;
};

export type AssignableReason = "assignable" | "status_not_assignable" | "pickup_order" | "delivery_locked";

export function assignableOrderReason(order: AssignableOrderInput): AssignableReason {
  const snapshot = order.deliverySnapshot;
  if (!snapshot || snapshot.methodKind === "pickup" || !snapshot.zoneId) return "pickup_order";
  if (!(ASSIGNABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) return "status_not_assignable";
  if (order.delivery && !REASSIGNABLE_DELIVERY_STATUSES.has(order.delivery.status)) return "delivery_locked";
  return "assignable";
}

export function isAssignableOrder(order: AssignableOrderInput) {
  return assignableOrderReason(order) === "assignable";
}

export function isReadyForAssignment(order: AssignableOrderInput) {
  return isAssignableOrder(order) && order.status === "ready_for_handoff";
}

export function isVisibleInAssignmentQueue(status: string, paymentStatus: string) {
  return status !== "pending_seller_confirmation" || paymentStatus === "paid";
}

export function assignableOrderLabel(
  status: string,
  paymentStatus?: string,
): "prête" | "à préparer" | "à confirmer" | "paiement en attente" {
  if (status === "ready_for_handoff") return "prête";
  if (status === "pending_seller_confirmation") {
    return paymentStatus === "paid" ? "à confirmer" : "paiement en attente";
  }
  return "à préparer";
}
