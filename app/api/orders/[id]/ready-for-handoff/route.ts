import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("mark_order_ready_for_handoff", {
      p_order_id: id,
    });
    if (error) throw error;

    const admin = requireAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select("public_code, buyer_id")
      .eq("id", id)
      .maybeSingle();
    if (order) {
      await enqueueEmail(admin, {
        dedupeKey: `order-status:${id}:ready_for_handoff`,
        template: "order_status_changed",
        recipientUserId: order.buyer_id,
        payload: {
          orderCode: order.public_code,
          statusLabel: "Prête à remettre",
          publicMessage: "La boutique a préparé votre commande.",
          url: new URL(`/commandes/${id}`, request.url).toString(),
        },
      }).catch(() => false);
    }
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

