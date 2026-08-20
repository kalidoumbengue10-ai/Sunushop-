import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireFulfillment as requireManager } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";

// Annulation d'une invitation encore en attente : la ligne est retirée plutôt
// que désactivée, pour ne pas laisser de rattachement fantôme dans l'équipe.
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

    const { error: deleteError } = await admin
      .from("courier_memberships")
      .delete()
      .eq("id", id)
      .eq("merchant_id", merchantId)
      .eq("status", "pending_invitation");
    if (deleteError) throw deleteError;

    return apiSuccess({ id }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
