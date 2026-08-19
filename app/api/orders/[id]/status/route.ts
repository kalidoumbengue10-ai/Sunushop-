import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { orderTransitionSchema } from "@/lib/domain/schemas";
import { merchantStatusLabel } from "@/lib/domain/merchant-ui";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = orderTransitionSchema.parse(await request.json());
    const { user, supabase } = await requireUser();
    const { data, error } = await supabase.rpc("transition_order_status", {
      p_order_id: id,
      p_to_status: input.status,
      p_public_message: input.publicMessage ?? null,
      p_internal_note: input.internalNote ?? null,
    });
    if (error) throw error;
    const admin = requireAdminClient();
    const { data: order } = await admin.from("orders").select("public_code, buyer_id, merchant_id").eq("id", id).maybeSingle();
    if (order) {
      await enqueueEmail(admin, { dedupeKey: `order-status:${id}:${input.status}`, template: "order_status_changed", recipientUserId: order.buyer_id, payload: { orderCode: order.public_code, statusLabel: merchantStatusLabel(input.status), publicMessage: input.publicMessage, url: new URL(`/commandes/${id}`, request.url).toString() } }).catch(() => false);
      if (input.status === "cancelled" && order.buyer_id === user.id) {
        const { data: merchant } = await admin.from("merchant_accounts").select("owner_user_id").eq("id", order.merchant_id).maybeSingle();
        if (merchant?.owner_user_id) {
          await enqueueEmail(admin, { dedupeKey: `order-cancelled-by-buyer:${id}`, template: "order_status_changed", recipientUserId: merchant.owner_user_id, payload: { orderCode: order.public_code, statusLabel: "Commande annulée par le client", publicMessage: input.publicMessage, url: new URL("/marchand", request.url).toString() } }).catch(() => false);
        }
      }
    }
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
