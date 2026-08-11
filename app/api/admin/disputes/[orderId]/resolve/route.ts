import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { directDisputeResolutionSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { orderId: disputeId } = await context.params;
    const input = directDisputeResolutionSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["support", "admin"]);
    const { data, error } = await supabase.rpc("resolve_direct_order_dispute", {
      p_dispute_id: disputeId,
      p_resolution: input.resolution,
      p_note: input.note,
    });
    if (error) throw error;
    const dispute = data as unknown as { order_id?: string; merchant_id?: string; buyer_id?: string };
    if (dispute?.order_id) {
      const admin = requireAdminClient();
      const { data: order } = await admin.from("orders").select("public_code, buyer_id, merchant_accounts(email, owner_user_id)").eq("id", dispute.order_id).maybeSingle();
      const merchant = Array.isArray(order?.merchant_accounts) ? order?.merchant_accounts[0] : order?.merchant_accounts;
      const payload = { orderCode: order?.public_code, resolution: input.resolution, message: input.note, url: new URL(`/commandes/${dispute.order_id}`, request.url).toString() };
      await Promise.allSettled([
        enqueueEmail(admin, { dedupeKey: `direct-dispute:${disputeId}:buyer`, template: "order_dispute_resolved", recipientUserId: order?.buyer_id, payload }),
        enqueueEmail(admin, { dedupeKey: `direct-dispute:${disputeId}:merchant`, template: "order_dispute_resolved", to: merchant?.email, recipientUserId: merchant?.owner_user_id, payload }),
      ]);
    }
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
