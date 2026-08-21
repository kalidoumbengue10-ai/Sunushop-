import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export const maxDuration = 30;

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    const [{ data, error }, { data: billingChanged, error: billingError }] = await Promise.all([
      admin.rpc("refresh_subscription_states"),
      admin.rpc("refresh_subscription_billing_periods"),
    ]);
    if (error) throw error;
    if (billingError) throw billingError;

    // La RPC exclut les dedupe_key existantes AVANT le LIMIT. Les anciens
    // abonnements ne peuvent donc plus occuper éternellement les 500 places
    // du lot et affamer les notifications suivantes.
    const { data: queued, error: queueError } = await admin.rpc("enqueue_due_subscription_notifications", {
      p_dashboard_url: new URL("/marchand", request.url).toString(),
      p_limit: 500,
    });
    if (queueError) throw queueError;

    return apiSuccess(
      { changed: data ?? 0, billingChanged: billingChanged ?? 0, emailsQueued: queued ?? 0 },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
