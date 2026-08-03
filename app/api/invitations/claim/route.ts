import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { hashInvitationToken } from "@/lib/domain/invitation-token";
import { invitationClaimSchema, merchantApplicationSchema } from "@/lib/domain/schemas";
import { createPublicSlug } from "@/lib/domain/public-slug";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = invitationClaimSchema.parse(await request.json());
    const { user, supabase } = await requireUser();
    const admin = requireAdminClient();
    const { data: invitation, error } = await admin
      .from("workspace_invitations")
      .select("id, kind, merchant_id, lead_id, email, payload, status, expires_at, invited_by")
      .eq("token_hash", hashInvitationToken(input.token))
      .maybeSingle();
    if (error) throw error;
    if (
      !invitation ||
      invitation.status !== "pending" ||
      new Date(invitation.expires_at).getTime() <= Date.now()
    ) {
      throw new ApiError(404, "INVITATION_NOT_FOUND", "Invitation invalide.");
    }
    if (!user.email || user.email.toLowerCase() !== String(invitation.email).toLowerCase()) {
      throw new ApiError(403, "INVITATION_EMAIL_MISMATCH", "Adresse email différente.");
    }

    let merchantId: string;
    if (invitation.kind === "merchant_owner") {
      const payload = merchantApplicationSchema.parse(invitation.payload);
      const { data: existingMembership } = await admin
        .from("merchant_members")
        .select("merchant_id")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .eq("active", true)
        .maybeSingle();
      if (existingMembership) {
        merchantId = existingMembership.merchant_id;
      } else {
        const { data, error: applicationError } = await supabase.rpc(
          "create_merchant_application",
          {
            p_kind: payload.kind,
            p_public_name: payload.publicName,
            p_slug: payload.slug ?? createPublicSlug(payload.publicName),
            p_phone: payload.phone,
            p_email: payload.email ?? user.email,
            p_legal_name: payload.legalName ?? null,
            p_region: payload.region ?? null,
            p_city: payload.city ?? null,
            p_address_hint: payload.addressHint ?? null,
            p_representative_is_legal_owner: payload.representativeIsLegalOwner,
          },
        );
        if (applicationError) throw applicationError;
        merchantId = String((data as { merchantId: string }).merchantId);
      }
    } else {
      merchantId = String(invitation.merchant_id);
      const payload = invitation.payload as { displayName?: string; phone?: string };
      const { error: membershipError } = await admin
        .from("courier_memberships")
        .upsert(
          {
            merchant_id: merchantId,
            courier_user_id: user.id,
            display_name: payload.displayName,
            phone: payload.phone,
            status: "active",
            invited_by: invitation.invited_by,
          },
          { onConflict: "merchant_id,courier_user_id" },
        );
      if (membershipError) throw membershipError;
    }

    const { error: claimError } = await admin
      .from("workspace_invitations")
      .update({
        status: "claimed",
        claimed_by: user.id,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)
      .eq("status", "pending");
    if (claimError) throw claimError;
    if (invitation.lead_id) {
      await admin
        .from("crm_leads")
        .update({
          status: "converted",
          merchant_id: merchantId,
          converted_at: new Date().toISOString(),
        })
        .eq("id", invitation.lead_id);
    }
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: merchantId,
      action: "workspace.invitation.claim",
      entity_type: "workspace_invitation",
      entity_id: invitation.id,
      request_id: requestId,
      metadata: { kind: invitation.kind },
    });
    return apiSuccess({ kind: invitation.kind, merchantId }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
