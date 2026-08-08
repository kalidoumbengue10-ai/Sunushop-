import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { disputeResolutionSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";
import { refundPayment } from "@/lib/providers/paytech";

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { orderId } = await context.params;
    const input = disputeResolutionSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["support", "admin"]);

    const { data: escrow, error } = await supabase.rpc("resolve_order_dispute", {
      p_order_id: orderId,
      p_resolution: input.resolution,
      p_note: input.note ?? null,
    });
    if (error) throw error;

    const admin = requireAdminClient();
    if (input.resolution === "refund") {
      const { error: loyaltyError } = await admin.rpc("reverse_order_loyalty", { p_order_id: orderId });
      if (loyaltyError) throw loyaltyError;
    }
    const { data: order } = await admin
      .from("orders")
      .select("public_code, total_xof, buyer_id, merchant_id, batch_id, merchant_accounts(public_name, email, owner_user_id)")
      .eq("id", orderId)
      .maybeSingle();
    const merchant = order
      ? Array.isArray(order.merchant_accounts)
        ? order.merchant_accounts[0]
        : order.merchant_accounts
      : null;

    if (input.resolution === "refund" && order?.batch_id) {
      // refundPayment appelle PayTech (application/x-www-form-urlencoded,
      // ref_command=...). L'IPN refund_complete finalisera l'escrow en
      // 'refunded' via mark_escrow_refunded — resolve_order_dispute ne fait
      // que tracer la décision côté escrow pour ce cas.
      const { data: intent } = await admin
        .from("payment_intents")
        .select("ref_command")
        .eq("order_batch_id", order.batch_id)
        .eq("kind", "order")
        .maybeSingle();
      if (intent?.ref_command) {
        await refundPayment(intent.ref_command);
      }
    }

    if (order) {
      await enqueueEmail(admin, {
        dedupeKey: `dispute-resolved:${orderId}:buyer`,
        template: "order_dispute_resolved",
        recipientUserId: order.buyer_id,
        payload: { orderCode: order.public_code, resolution: input.resolution, shopName: merchant?.public_name },
      }).catch(() => false);
      if (merchant?.email) {
        await enqueueEmail(admin, {
          dedupeKey: `dispute-resolved:${orderId}:merchant`,
          template: "order_dispute_resolved",
          to: merchant.email,
          recipientUserId: merchant.owner_user_id,
          payload: { orderCode: order.public_code, resolution: input.resolution, shopName: merchant.public_name },
        }).catch(() => false);
      }
    }

    return apiSuccess(escrow, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
