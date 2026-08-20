import * as Sentry from "@sentry/nextjs";
import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { sendNotificationEmail } from "@/lib/notifications/email";

const MAX_ATTEMPTS = 5;

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
      .lt("created_at", staleBefore)
      .limit(25);
    if (stale?.length) {
      Sentry.captureMessage("Notifications en attente sans tentative", {
        level: "warning",
        tags: { cron: "notifications" },
        extra: { notifications: stale },
      });
    }
    const { data: pending, error } = await admin
      .from("notification_outbox")
      .select("id, template, payload, attempts")
      .eq("channel", "email")
      .in("status", ["pending", "failed"])
      .lte("available_at", new Date().toISOString())
      .lt("attempts", 5)
      .order("created_at")
      .limit(25);
    if (error) throw error;

    let sent = 0;
    for (const item of pending ?? []) {
      const payload = item.payload as Record<string, unknown>;
      await admin.from("notification_outbox").update({ status: "processing" }).eq("id", item.id);
      try {
        await sendNotificationEmail(item.template, payload);
        await admin
          .from("notification_outbox")
          .update({ status: "sent", attempts: item.attempts + 1, processed_at: new Date().toISOString(), last_error: null })
          .eq("id", item.id);
        sent += 1;
      } catch (sendError) {
        const attempts = item.attempts + 1;
        await admin
          .from("notification_outbox")
          .update({
            status: "failed",
            attempts,
            available_at: new Date(Date.now() + Math.min(86_400_000, 60_000 * 2 ** attempts)).toISOString(),
            last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "SEND_FAILED",
          })
          .eq("id", item.id);
        if (attempts >= MAX_ATTEMPTS) {
          Sentry.captureException(sendError, {
            tags: { outboxId: item.id, template: item.template, attempts },
          });
        }
      }
    }
    return apiSuccess({ processed: pending?.length ?? 0, sent }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
