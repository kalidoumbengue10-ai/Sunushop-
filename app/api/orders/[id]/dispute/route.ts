import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { orderDisputeSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = orderDisputeSchema.parse(await request.json());
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.rpc("open_order_dispute", {
      p_order_id: id,
      p_reason: input.reason,
    });
    if (error) throw error;

    const admin = requireAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select("public_code, total_xof, merchant_id, buyer_id, merchant_accounts(public_name, email, owner_user_id)")
      .eq("id", id)
      .maybeSingle();
    const merchant = order
      ? Array.isArray(order.merchant_accounts)
        ? order.merchant_accounts[0]
        : order.merchant_accounts
      : null;

    if (order) {
      const savEmail = process.env.SUNUSHOP_SAV_EMAIL?.trim() || "sunushop1@gmail.com";
      const adminUrl = new URL("/admin?tab=litiges", request.url).toString();
      await enqueueEmail(admin, {
        dedupeKey: `dispute-opened:${id}:sav`,
        template: "order_dispute_opened",
        to: savEmail,
        payload: {
          orderCode: order.public_code,
          totalXof: order.total_xof,
          reason: input.reason,
          shopName: merchant?.public_name,
          url: adminUrl,
        },
      }).catch(() => false);
      if (merchant?.email) {
        await enqueueEmail(admin, {
          dedupeKey: `dispute-opened:${id}:merchant`,
          template: "order_dispute_opened",
          to: merchant.email,
          recipientUserId: merchant.owner_user_id,
          payload: { orderCode: order.public_code, totalXof: order.total_xof, reason: input.reason, shopName: merchant.public_name },
        }).catch(() => false);
      }
      await enqueueEmail(admin, {
        dedupeKey: `dispute-opened:${id}:buyer`,
        template: "order_dispute_opened",
        recipientUserId: user.id,
        payload: { orderCode: order.public_code, totalXof: order.total_xof, reason: input.reason, shopName: merchant?.public_name },
      }).catch(() => false);
    }

    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
