const PAYMENT_STATUSES = new Set([
  "awaiting_payment",
  "cash_due",
  "pending_confirmation",
  "paid",
  "payment_refused",
  "refund_pending",
  "refunded",
]);

export function merchantOrderStatusFilter(status: string) {
  if (status === "all") return null;
  return {
    column: PAYMENT_STATUSES.has(status) ? "payment_status" as const : "status" as const,
    value: status,
  };
}

export function merchantOrderSearchFilter(query?: string) {
  const normalized = query?.trim();
  if (!normalized) return null;
  const merchantSequence = normalized.replace(/^CMD-/i, "").replace(/^0+/, "");
  if (/^\d+$/.test(merchantSequence)) {
    return { kind: "merchant_sequence" as const, value: Number(merchantSequence) };
  }
  return { kind: "public_code" as const, value: normalized };
}
