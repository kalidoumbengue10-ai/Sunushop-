import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { createInvitationToken, invitationUrl } from "@/lib/domain/invitation-token";
import { merchantInvitationSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantInvitationSchema.parse(await request.json());
    const { user } = await requireAdminRole(["support", "admin"]);
    const admin = requireAdminClient();
    const { token, tokenHash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { data: invitation, error } = await admin
      .from("workspace_invitations")
      .insert({
        kind: "merchant_owner",
        lead_id: input.leadId ?? null,
        email: input.email,
        token_hash: tokenHash,
        payload: input,
        expires_at: expiresAt,
        invited_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    const url = invitationUrl(request, token, input.email);
    const { error: outboxError } = await admin.from("notification_outbox").insert({
      dedupe_key: `merchant-invitation:${invitation.id}`,
      channel: "email",
      template: "merchant_invitation",
      payload: { to: input.email, shopName: input.publicName, url, expiresAt },
    });
    if (outboxError) throw outboxError;
    if (input.leadId) {
      await admin
        .from("crm_leads")
        .update({ status: "onboarding", last_contacted_at: new Date().toISOString() })
        .eq("id", input.leadId);
    }
    await admin.from("audit_events").insert({
      actor_id: user.id,
      action: "crm.merchant.invite",
      entity_type: "workspace_invitation",
      entity_id: invitation.id,
      request_id: requestId,
      metadata: { email: input.email, leadId: input.leadId ?? null },
    });
    return apiSuccess({ id: invitation.id, expiresAt }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
