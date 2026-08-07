import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("confirm_order_reception", {
      p_order_id: id,
    });
    if (error) throw error;

    const admin = requireAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select("public_code, merchant_id, merchant_accounts(public_name, email, owner_user_id)")
      .eq("id", id)
      .maybeSingle();
    const merchant = order
      ? Array.isArray(order.merchant_accounts)
        ? order.merchant_accounts[0]
        : order.merchant_accounts
      : null;
    if (order && merchant) {
      await enqueueEmail(admin, {
        dedupeKey: `order-funds-released:${id}`,
        template: "order_funds_released",
        to: merchant.email,
        recipientUserId: merchant.owner_user_id,
        payload: { orderCode: order.public_code, shopName: merchant.public_name },
      }).catch(() => false);
    }

    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
