import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    const { data, error } = await admin.rpc("refresh_subscription_states");
    if (error) throw error;
    const today = new Date();
    const inSevenDays = new Date(today.getTime() + 7 * 86400000).toISOString();
    const { data: subscriptions } = await admin.from("merchant_subscriptions")
      .select("id, merchant_id, status, current_period_ends_at, merchant_accounts(owner_user_id, email)")
      .in("status", ["active", "expired"])
      .lte("current_period_ends_at", inSevenDays)
      .order("current_period_ends_at");
    let queued = 0;
    for (const subscription of subscriptions ?? []) {
      const merchant = Array.isArray(subscription.merchant_accounts) ? subscription.merchant_accounts[0] : subscription.merchant_accounts;
      const remaining = Math.ceil((new Date(subscription.current_period_ends_at).getTime() - today.getTime()) / 86400000);
      const template = subscription.status === "expired" ? "subscription_expired" : remaining <= 2 ? "subscription_expires_j2" : "subscription_expires_j7";
      const sent = await enqueueEmail(admin, { dedupeKey: `subscription-email:${subscription.id}:${template}:${new Date(subscription.current_period_ends_at).toISOString().slice(0, 10)}`, template, to: merchant?.email, recipientUserId: merchant?.owner_user_id, payload: { currentPeriodEndsAt: subscription.current_period_ends_at, url: new URL("/marchand", request.url).toString() } }).catch(() => false);
      if (sent) queued += 1;
    }
    return apiSuccess({ changed: data ?? 0, emailsQueued: queued }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
