import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { courierInvitationUrl, createInvitationToken } from "@/lib/domain/invitation-token";
import { enqueueEmail } from "@/lib/notifications/outbox";

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
  const email = input.membership.email?.trim().toLowerCase() || null;
  const now = new Date().toISOString();

  // Un seul lien actif par rattachement. Un renvoi invalide immédiatement le
  // précédent afin qu'un ancien message transféré ne puisse plus être utilisé.
  await input.admin
    .from("workspace_invitations")
    .update({ status: "revoked" })
    .eq("kind", "courier")
    .eq("courier_membership_id", input.membership.id)
    .eq("status", "pending");

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const url = courierInvitationUrl(input.request, token);
  const { data: invitation, error } = await input.admin
    .from("workspace_invitations")
    .insert({
      kind: "courier",
      merchant_id: input.merchantId,
      courier_membership_id: input.membership.id,
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
  if (error) throw error;

  let emailQueued = false;
  if (email) {
    const { data: merchant } = await input.admin.from("merchant_accounts").select("public_name").eq("id", input.merchantId).maybeSingle();
    emailQueued = await enqueueEmail(input.admin, {
      dedupeKey: `courier-invitation:${invitation.id}`,
      template: "courier_invitation",
      to: email,
      payload: {
        displayName: input.membership.display_name,
        shopName: merchant?.public_name,
        url,
        expiresAt,
      },
      sendImmediately: true,
    });
  }

  const { data: notification } = email
    ? await input.admin
      .from("notification_outbox")
      .select("status, processed_at, last_error, delivery_state")
      .eq("dedupe_key", `courier-invitation:${invitation.id}`)
      .maybeSingle()
    : { data: null };

  return {
    id: invitation.id,
    expiresAt,
    invitationUrl: url,
    emailSent: notification?.status === "sent",
    invitation: {
      status: "pending" as const,
      emailStatus: !email ? "not_requested" : notification?.status === "sent" ? "accepted" : notification?.status === "failed" ? "failed" : emailQueued ? "queued" : "failed",
      deliveryState: notification?.delivery_state ?? (email ? "queued" : "not_requested"),
      sentAt: notification?.processed_at ?? null,
      expiresAt,
      invitationUrl: url,
      lastError: notification?.last_error ?? null,
      createdAt: now,
    },
  };
}
