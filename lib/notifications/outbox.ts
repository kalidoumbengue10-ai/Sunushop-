import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotificationEmail } from "@/lib/notifications/email";

export async function enqueueEmail(admin: SupabaseClient, input: { dedupeKey: string; template: string; to?: string | null; recipientUserId?: string | null; payload?: Record<string, unknown>; sendImmediately?: boolean }) {
  let to = input.to?.trim();
  if (!to && input.recipientUserId) {
    const { data } = await admin.from("profiles").select("email").eq("id", input.recipientUserId).maybeSingle();
    to = data?.email ?? undefined;
  }
  if (!to) return false;
  const payload = { ...(input.payload ?? {}), to };
  const { data, error } = await admin
    .from("notification_outbox")
    .insert({ dedupe_key: input.dedupeKey, recipient_user_id: input.recipientUserId ?? null, channel: "email", template: input.template, payload })
    .select("id")
    .single();
  if (error && error.code !== "23505") throw error;
  if (error || !data) return false;

  if (input.sendImmediately) {
    await admin.from("notification_outbox").update({ status: "processing" }).eq("id", data.id);
    try {
      await sendNotificationEmail(input.template, payload);
      await admin.from("notification_outbox").update({
        status: "sent",
        attempts: 1,
        processed_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", data.id);
    } catch (sendError) {
      await admin.from("notification_outbox").update({
        status: "failed",
        attempts: 1,
        available_at: new Date(Date.now() + 120_000).toISOString(),
        last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "SEND_FAILED",
      }).eq("id", data.id);
    }
  }

  return true;
}
