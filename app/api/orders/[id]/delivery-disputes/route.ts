import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { orderDisputeSchema } from "@/lib/domain/schemas";


export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: order, error: orderError } = await admin.from("orders").select("buyer_id").eq("id", id).maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.buyer_id !== user.id) throw new ApiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
    const { data, error } = await admin
      .from("delivery_disputes")
      .select("id, delivery_id, reason, status, resolution, opened_at, resolved_at, delivery_dispute_events(id, event_type, message, created_at)")
      .eq("order_id", id)
      .order("opened_at", { ascending: false });
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const [{ id }, input, { user }] = await Promise.all([
      context.params,
      request.json().then((body) => orderDisputeSchema.parse(body)),
      requireUser(),
    ]);
    const admin = requireAdminClient();
    const { data: dispute, error } = await admin.rpc("open_delivery_dispute", {
      p_order_id: id,
      p_reason: input.reason,
      p_actor_id: user.id,
    });
    if (error) throw error;
    return apiSuccess(dispute, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
