import type { DeliveryStatus } from "./delivery";

const activeDisputeStatuses = new Set<DeliveryStatus>(["assigned", "accepted", "at_pickup", "picked_up", "in_transit"]);
const terminalDisputeStatuses = new Set<DeliveryStatus>(["delivered", "failed"]);
export const DELIVERY_DISPUTE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function canOpenDeliveryDispute(
  status: DeliveryStatus,
  terminalAt: string | null,
  now = new Date(),
) {
  if (activeDisputeStatuses.has(status)) return true;
  if (!terminalDisputeStatuses.has(status) || !terminalAt) return false;
  const age = now.getTime() - new Date(terminalAt).getTime();
  return age >= 0 && age <= DELIVERY_DISPUTE_WINDOW_MS;
}

export function calculateCourierPayoutTotal(
  deliveries: Array<{ courier_payment_status: string; courier_payable_xof: number }>,
) {
  return deliveries
    .filter((delivery) => delivery.courier_payment_status === "due")
    .reduce((total, delivery) => total + delivery.courier_payable_xof, 0);
}
