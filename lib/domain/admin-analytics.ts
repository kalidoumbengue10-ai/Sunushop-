export function subscriptionCatalogValue(monthlyPriceXof: number, days: number) {
  if (!Number.isFinite(monthlyPriceXof) || monthlyPriceXof < 0) throw new Error("SUBSCRIPTION_PRICE_INVALID");
  if (!Number.isFinite(days) || days <= 0) throw new Error("SUBSCRIPTION_DURATION_INVALID");
  return Math.round((monthlyPriceXof * days) / 30);
}

export function netOrderVolume(grossXof: number, confirmedRefundsXof: number) {
  return Math.max(0, grossXof - confirmedRefundsXof);
}

export function isRevenueOrder(order: { status: string; payment_status: string }) {
  return order.status !== "cancelled" && ["paid", "refund_pending", "refunded"].includes(order.payment_status);
}

