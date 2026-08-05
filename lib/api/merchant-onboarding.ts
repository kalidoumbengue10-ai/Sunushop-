import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createInvitationToken, invitationUrl } from "@/lib/domain/invitation-token";
import { createPublicSlug } from "@/lib/domain/public-slug";
import { sendNotificationEmail } from "@/lib/notifications/email";

export function normalizeMerchantPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `+221${digits}`;
  if (digits.startsWith("221") && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

export async function createMerchantOnboardingInvitation(input: {
  admin: SupabaseClient;
  request: Request;
  leadId?: string | null;
  email: string;
  kind: "informal" | "formal";
  publicName: string;
  phone: string;
  city?: string | null;
  region?: string | null;
  legalName?: string | null;
  invitedBy?: string | null;
}) {
  const { data: pending, error: pendingError } = await input.admin
    .from("workspace_invitations")
    .select("id, expires_at")
    .eq("kind", "merchant_owner")
    .eq("email", input.email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (pendingError) throw pendingError;
  if (pending) {
    const { data: queued } = await input.admin
      .from("notification_outbox")
      .select("id, payload, attempts")
      .eq("dedupe_key", `merchant-invitation:${pending.id}`)
      .maybeSingle();
    let emailSent = false;
    if (queued) {
      try {
        await sendNotificationEmail("merchant_invitation", queued.payload as Record<string, unknown>);
        emailSent = true;
        await input.admin.from("notification_outbox").update({
          status: "sent", attempts: queued.attempts + 1, processed_at: new Date().toISOString(), last_error: null,
        }).eq("id", queued.id);
      } catch (error) {
        await input.admin.from("notification_outbox").update({
          status: "failed", attempts: queued.attempts + 1,
          available_at: new Date(Date.now() + 120_000).toISOString(),
          last_error: error instanceof Error ? error.message.slice(0, 500) : "SEND_FAILED",
        }).eq("id", queued.id);
      }
    }
    const queuedPayload = queued?.payload as Record<string, unknown> | undefined;
    return {
      id: pending.id,
      expiresAt: pending.expires_at,
      emailSent,
      alreadyPending: true,
      invitationUrl: String(queuedPayload?.url ?? ""),
    };
  }

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data: invitation, error: invitationError } = await input.admin
    .from("workspace_invitations")
    .insert({
      kind: "merchant_owner",
      lead_id: input.leadId ?? null,
      email: input.email,
      token_hash: tokenHash,
      payload: {
        kind: input.kind,
        publicName: input.publicName,
        slug: createPublicSlug(input.publicName),
        phone: normalizeMerchantPhone(input.phone),
        email: input.email,
        city: input.city || undefined,
        region: input.region || undefined,
        legalName: input.legalName || undefined,
        representativeIsLegalOwner: true,
      },
      expires_at: expiresAt,
      invited_by: input.invitedBy ?? null,
    })
    .select("id")
    .single();
  if (invitationError) throw invitationError;

  const url = invitationUrl(input.request, token, input.email);
  const payload = { to: input.email, shopName: input.publicName, url, expiresAt };
  const { data: outbox, error: outboxError } = await input.admin
    .from("notification_outbox")
    .insert({
      dedupe_key: `merchant-invitation:${invitation.id}`,
      channel: "email",
      template: "merchant_invitation",
      payload,
    })
    .select("id")
    .single();
  if (outboxError) throw outboxError;

  let emailSent = false;
  try {
    await sendNotificationEmail("merchant_invitation", payload);
    emailSent = true;
    await input.admin.from("notification_outbox").update({
      status: "sent", attempts: 1, processed_at: new Date().toISOString(), last_error: null,
    }).eq("id", outbox.id);
  } catch (error) {
    await input.admin.from("notification_outbox").update({
      status: "failed", attempts: 1,
      available_at: new Date(Date.now() + 120_000).toISOString(),
      last_error: error instanceof Error ? error.message.slice(0, 500) : "SEND_FAILED",
    }).eq("id", outbox.id);
  }

  return { id: invitation.id, expiresAt, emailSent, alreadyPending: false, invitationUrl: url };
}
