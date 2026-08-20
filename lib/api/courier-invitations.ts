import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createInvitationToken, invitationUrl } from "@/lib/domain/invitation-token";
import { sendNotificationEmail } from "@/lib/notifications/email";

type CourierMembership = {
  id: string;
  email: string | null;
  display_name: string;
  phone: string;
  vehicle_type: string | null;
  vehicle_registration: string | null;
};

export async function sendCourierInvitation(input: {
  admin: SupabaseClient;
  request: Request;
  merchantId: string;
  membership: CourierMembership;
  invitedBy: string;
}) {
  const email = input.membership.email?.trim().toLowerCase();
  if (!email) throw new Error("COURIER_EMAIL_REQUIRED");

  const now = new Date().toISOString();
  const { data: pendingInvitations, error: pendingError } = await input.admin
    .from("workspace_invitations")
    .select("id, expires_at, created_at")
    .eq("kind", "courier")
    .eq("merchant_id", input.merchantId)
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (pendingError) throw pendingError;

  const validInvitation = pendingInvitations?.find((invitation) => invitation.expires_at > now) ?? null;
  const expiredIds = (pendingInvitations ?? [])
    .filter((invitation) => invitation.expires_at <= now)
    .map((invitation) => invitation.id);
  if (expiredIds.length) {
    await input.admin.from("workspace_invitations").update({ status: "expired" }).in("id", expiredIds);
  }

  let invitationId = validInvitation?.id ?? null;
  let expiresAt = validInvitation?.expires_at ?? null;
  let url = "";
  let outboxId: string | null = null;
  let attempts = 0;

  if (invitationId) {
    const { data: queued, error: queuedError } = await input.admin
      .from("notification_outbox")
      .select("id, payload, attempts")
      .eq("dedupe_key", `courier-invitation:${invitationId}`)
      .maybeSingle();
    if (queuedError) throw queuedError;
    const payload = queued?.payload as Record<string, unknown> | null;
    url = typeof payload?.url === "string" ? payload.url : "";
    outboxId = queued?.id ?? null;
    attempts = queued?.attempts ?? 0;
  }

  if (!invitationId || !expiresAt || !url) {
    if (invitationId) {
      await input.admin.from("workspace_invitations").update({ status: "revoked" }).eq("id", invitationId);
    }
    const { token, tokenHash } = createInvitationToken();
    expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { data: invitation, error: invitationError } = await input.admin
      .from("workspace_invitations")
      .insert({
        kind: "courier",
        merchant_id: input.merchantId,
        email,
        token_hash: tokenHash,
        payload: {
          displayName: input.membership.display_name,
          phone: input.membership.phone,
          vehicleType: input.membership.vehicle_type,
          vehicleRegistration: input.membership.vehicle_registration,
        },
        expires_at: expiresAt,
        invited_by: input.invitedBy,
      })
      .select("id")
      .single();
    if (invitationError) throw invitationError;
    invitationId = invitation.id;
    url = invitationUrl(input.request, token, email);

    const payload = { to: email, displayName: input.membership.display_name, url, expiresAt };
    const { data: queued, error: outboxError } = await input.admin
      .from("notification_outbox")
      .insert({
        dedupe_key: `courier-invitation:${invitationId}`,
        channel: "email",
        template: "courier_invitation",
        payload,
      })
      .select("id")
      .single();
    if (outboxError) throw outboxError;
    outboxId = queued.id;
    attempts = 0;
  }

  const payload = { to: email, displayName: input.membership.display_name, url, expiresAt };
  let emailSent = false;
  let emailStatus: "sent" | "failed" = "failed";
  let lastError: string | null = null;

  if (!outboxId) throw new Error("COURIER_INVITATION_OUTBOX_REQUIRED");
  await input.admin.from("notification_outbox").update({ status: "processing" }).eq("id", outboxId);
  try {
    await sendNotificationEmail("courier_invitation", payload);
    emailSent = true;
    emailStatus = "sent";
    await input.admin.from("notification_outbox").update({
      status: "sent",
      attempts: attempts + 1,
      processed_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", outboxId);
  } catch (error) {
    lastError = error instanceof Error ? error.message.slice(0, 500) : "SEND_FAILED";
    await input.admin.from("notification_outbox").update({
      status: "failed",
      attempts: attempts + 1,
      available_at: new Date(Date.now() + 120_000).toISOString(),
      last_error: lastError,
    }).eq("id", outboxId);
  }

  return {
    id: invitationId,
    expiresAt,
    invitationUrl: url,
    emailSent,
    invitation: {
      status: "pending" as const,
      emailStatus,
      sentAt: emailSent ? new Date().toISOString() : null,
      expiresAt,
      invitationUrl: url,
      lastError,
    },
  };
}

