import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { hashInvitationToken } from "@/lib/domain/invitation-token";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (token.length < 32) throw new ApiError(404, "INVITATION_NOT_FOUND", "Ce lien d’invitation est incomplet.");
    const admin = requireAdminClient();
    const { data: invitation, error } = await admin
      .from("workspace_invitations")
      .select("id, payload, expires_at, status, courier_membership_id")
      .eq("token_hash", hashInvitationToken(token))
      .eq("kind", "courier")
      .maybeSingle();
    if (error) throw error;
    if (!invitation) throw new ApiError(404, "INVITATION_NOT_FOUND", "Cette invitation est introuvable.");
    return await preview(admin, invitation, requestId);
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

async function preview(admin: ReturnType<typeof requireAdminClient>, invitation: {
  id: string;
  payload: unknown;
  expires_at: string;
  status: string;
  courier_membership_id: string | null;
}, requestId: string) {
  if (invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
    throw new ApiError(410, "INVITATION_EXPIRED", "Ce lien a expiré. Demandez au marchand de vous en renvoyer un.");
  }
  if (!invitation.courier_membership_id) throw new ApiError(404, "INVITATION_NOT_FOUND", "Cette invitation est incomplète.");
  const { data: membership, error } = await admin
    .from("courier_memberships")
    .select("id, display_name, phone, courier_profile_id, merchant_accounts!inner(public_name, city, region)")
    .eq("id", invitation.courier_membership_id)
    .single();
  if (error) throw error;
  const shop = Array.isArray(membership.merchant_accounts) ? membership.merchant_accounts[0] : membership.merchant_accounts;
  return apiSuccess({
    displayName: membership.display_name,
    maskedPhone: membership.phone.replace(/(\d{2})\d+(\d{2})$/, "$1•••••$2"),
    shopName: shop?.public_name ?? "Boutique",
    location: [shop?.city, shop?.region].filter(Boolean).join(" · "),
    expiresAt: invitation.expires_at,
  }, { requestId });
}
