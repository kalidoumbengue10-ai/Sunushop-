export const deliveryTransitions = {
  assigned: ["accepted", "cancelled"],
  accepted: ["at_pickup", "cancelled"],
  at_pickup: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "failed"],
  in_transit: ["delivered", "failed"],
  delivered: [],
  failed: [],
  cancelled: [],
} as const;

export type DeliveryStatus = keyof typeof deliveryTransitions;

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus) {
  return (deliveryTransitions[from] as readonly string[]).includes(to);
}

export function anonymizeCompletedDelivery<T extends {
  status: DeliveryStatus;
  recipient?: Record<string, unknown> | null;
}>(delivery: T, options: { allowTerminalDetails?: boolean } = {}) {
  if (options.allowTerminalDetails || !['delivered', 'failed', 'cancelled'].includes(delivery.status)) return delivery;
  const recipient = delivery.recipient ?? {};
  return {
    ...delivery,
    recipient: {
      region: recipient.region ?? null,
      city: recipient.city ?? null,
      addressHint: null,
      name: null,
      phone: null,
    },
  };
}
