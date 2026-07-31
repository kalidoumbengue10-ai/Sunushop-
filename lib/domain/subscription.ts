export type ComputedSubscriptionStatus = "active" | "grace" | "expired";

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
