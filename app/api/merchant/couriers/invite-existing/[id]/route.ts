import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireFulfillment as requireManager } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";

// Révocation conservée dans l'historique : les offres encore ouvertes sont
// annulées et le rattachement devient inactif sans supprimer son audit.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    await requireManager(merchantId);
    const admin = requireAdminClient();

    const { data: membership, error } = await admin
      .from("courier_memberships")
      .select("id, status")
      .eq("id", id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (error) throw error;
    if (!membership) throw new ApiError(404, "COURIER_INVITATION_NOT_FOUND", "Cette invitation est introuvable.");
    if (membership.status !== "pending_invitation") {
      throw new ApiError(409, "COURIER_INVITATION_ALREADY_ANSWERED", "Ce livreur a déjà répondu à votre invitation.");
    }

    const [{ error: invitationError }, { error: offerError }, { error: membershipError }] = await Promise.all([
      (admin as any).from("workspace_invitations").update({ status: "revoked" }).eq("courier_membership_id", id).eq("status", "pending"),
      (admin as any).from("delivery_offers").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("courier_membership_id", id).eq("status", "pending"),
      admin.from("courier_memberships").update({ status: "inactive", responded_at: new Date().toISOString() }).eq("id", id).eq("status", "pending_invitation"),
    ]);
    if (invitationError) throw invitationError;
    if (offerError) throw offerError;
    if (membershipError) throw membershipError;

    return apiSuccess({ id, status: "inactive" }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
