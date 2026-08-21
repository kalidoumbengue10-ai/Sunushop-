import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export const maxDuration = 30;

// Purge périodique des tables techniques sans valeur de conformité
// (rate_limit_buckets, webhook_events traités). audit_events est
// délibérément exclue : c'est une piste d'audit append-only.
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    const [{ data: rateLimitDeleted, error: rateLimitError }, { data: webhookEventsDeleted, error: webhookEventsError }] = await Promise.all([
      admin.rpc("purge_expired_rate_limit_buckets", { p_retention_hours: 24, p_limit: 5000 }),
      admin.rpc("purge_processed_webhook_events", { p_retention_days: 30, p_limit: 5000 }),
    ]);
    if (rateLimitError) throw rateLimitError;
    if (webhookEventsError) throw webhookEventsError;

    return apiSuccess(
      { rateLimitBucketsDeleted: rateLimitDeleted ?? 0, webhookEventsDeleted: webhookEventsDeleted ?? 0 },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
