import * as Sentry from "@sentry/nextjs";
import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { sendNotificationEmail } from "@/lib/notifications/email";

const MAX_ATTEMPTS = 5;
const CLAIM_LIMIT = 10;
const SEND_CONCURRENCY = 5;

export const maxDuration = 30;

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: stale } = await admin
      .from("notification_outbox")
      .select("id, template, created_at")
      .eq("channel", "email")
      .eq("status", "pending")
      .eq("attempts", 0)
      .is("suppressed_at", null)
      .lt("created_at", staleBefore)
      .limit(25);
    if (stale?.length) {
      Sentry.captureMessage("Notifications en attente sans tentative", {
        level: "warning",
        tags: { cron: "notifications" },
        extra: { notifications: stale },
      });
    }
    // Claim atomique (select + update status='processing' dans la même
    // transaction, verrouillage `for update skip locked`) : deux exécutions
    // qui se chevauchent ne peuvent jamais traiter la même notification.
    const { data: pending, error } = await admin.rpc("claim_notification_outbox", { p_limit: CLAIM_LIMIT });
    if (error) throw error;

    const processItem = async (item: NonNullable<typeof pending>[number]) => {
      const payload = item.payload as Record<string, unknown>;
      try {
        const sentEmail = await sendNotificationEmail(item.template, payload, { idempotencyKey: `outbox/${item.id}` });
        await (admin as any)
          .from("notification_outbox")
          .update({ status: "sent", attempts: item.attempts + 1, processed_at: new Date().toISOString(), processing_started_at: null, last_error: null, delivery_state: "accepted", provider_message_id: sentEmail.providerMessageId })
          .eq("id", item.id);
        return true;
      } catch (sendError) {
        const attempts = item.attempts + 1;
        await (admin as any)
          .from("notification_outbox")
          .update({
            status: "failed",
            delivery_state: "failed",
            attempts,
            available_at: new Date(Date.now() + Math.min(86_400_000, 60_000 * 2 ** attempts)).toISOString(),
            processing_started_at: null,
            last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "SEND_FAILED",
          })
          .eq("id", item.id);
        if (attempts >= MAX_ATTEMPTS) {
          Sentry.captureException(sendError, {
            tags: { outboxId: item.id, template: item.template, attempts },
          });
        }
        return false;
      }
    };

    const results: boolean[] = [];
    for (let offset = 0; offset < (pending?.length ?? 0); offset += SEND_CONCURRENCY) {
      const chunk = pending!.slice(offset, offset + SEND_CONCURRENCY);
      results.push(...await Promise.all(chunk.map(processItem)));
    }
    const sent = results.filter(Boolean).length;
    return apiSuccess({ processed: pending?.length ?? 0, sent }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
