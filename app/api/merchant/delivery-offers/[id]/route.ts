import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const { data, error } = await (supabase as any).rpc("cancel_delivery_offer", {
      p_offer_id: id,
      p_actor_id: user.id,
    });
    if (error) {
      if (String(error.message).includes("DELIVERY_OFFER_NOT_FOUND")) {
        throw new ApiError(404, "DELIVERY_OFFER_NOT_FOUND", "Cette proposition est introuvable.");
      }
      if (String(error.message).includes("DELIVERY_OFFER_ALREADY_ANSWERED")) {
        throw new ApiError(409, "DELIVERY_OFFER_ALREADY_ANSWERED", "Cette proposition a déjà reçu une réponse.");
      }
      throw error;
    }
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
