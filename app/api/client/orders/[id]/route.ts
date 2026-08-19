import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { canBuyerHideOrder } from "@/lib/domain/client-order-actions";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, buyer_id, merchant_id, status, payment_status")
      .eq("id", id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.buyer_id !== user.id) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
    }
    if (!canBuyerHideOrder(order.status, order.payment_status)) {
      throw new ApiError(
        409,
        "ORDER_NOT_REMOVABLE",
        "Annulez d’abord la commande et attendez la fin de tout remboursement.",
      );
    }
    const { error } = await admin
      .from("orders")
      .update({ buyer_hidden_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("buyer_id", user.id);
    if (error) throw error;
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: order.merchant_id,
      action: "order.hidden_by_buyer",
      entity_type: "order",
      entity_id: order.id,
      request_id: requestId,
    });
    return apiSuccess({ hidden: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
