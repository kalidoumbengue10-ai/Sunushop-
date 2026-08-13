export type ComputedSubscriptionStatus = "active" | "grace" | "expired";

export const BILLING_CYCLES = {
  monthly: { months: 1, label: "Mensuelle" },
  quarterly: { months: 3, label: "Trimestrielle" },
  annual: { months: 12, label: "Annuelle" },
} as const;

export type BillingCycle = keyof typeof BILLING_CYCLES;

export function isBillingCycle(value: string): value is BillingCycle {
  return Object.prototype.hasOwnProperty.call(BILLING_CYCLES, value);
}

export function billingCycleMonths(cycle: BillingCycle) {
  return BILLING_CYCLES[cycle].months;
}

export function subscriptionAmountXof(
  monthlyPriceXof: number,
  cycle: BillingCycle,
) {
  return monthlyPriceXof * billingCycleMonths(cycle);
}

export function subscriptionStatusAt(
  currentPeriodEndsAt: Date,
  graceEndsAt: Date,
  now = new Date(),
): ComputedSubscriptionStatus {
  if (now < currentPeriodEndsAt) return "active";
  if (now < graceEndsAt) return "grace";
  return "expired";
}

export function subscriptionReminderWindow(
  currentPeriodEndsAt: Date,
  now = new Date(),
) {
  const days = Math.ceil(
    (currentPeriodEndsAt.getTime() - now.getTime()) / 86_400_000,
  );
  if (days === 7) return "j-7";
  if (days === 2) return "j-2";
  return null;
}
