export const ORDER_STATUS = [
  "pending_seller_confirmation",
  "confirmed",
  "preparing",
  "ready_for_handoff",
  "in_transit",
  "delivered",
  "cancelled",
  "disputed",
] as const;

export type OrderStatus = (typeof ORDER_STATUS)[number];

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_seller_confirmation: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled", "disputed"],
  preparing: ["ready_for_handoff", "cancelled", "disputed"],
  ready_for_handoff: ["in_transit", "cancelled", "disputed"],
  in_transit: ["delivered", "disputed"],
  delivered: ["disputed"],
  cancelled: [],
  disputed: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
