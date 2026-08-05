import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { orderBatchSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";
import { formatMerchantOrderNumber } from "@/lib/domain/merchant-ui";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length < 12) {
      throw new ApiError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Une clé d’idempotence est obligatoire.",
      );
    }
    const input = orderBatchSchema.parse(await request.json());
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.rpc("create_order_batch", {
      p_idempotency_key: idempotencyKey,
      p_recipient: input.recipient,
      p_groups: input.groups,
    });
    if (error) throw error;
    const result = data as { batchId: string; publicCode: string; totalXof: number };
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, public_code, merchant_id, merchant_sequence, total_xof, status")
      .eq("batch_id", result.batchId)
      .order("created_at");
    if (ordersError) throw ordersError;
    const admin = requireAdminClient();
    const merchantIds = [...new Set((orders ?? []).map((order) => order.merchant_id))];
    const { data: merchants } = await admin.from("merchant_accounts").select("id, public_name, email").in("id", merchantIds);
    const merchantMap = new Map((merchants ?? []).map((merchant) => [merchant.id, merchant]));
    await Promise.allSettled((orders ?? []).flatMap((order) => {
      const merchant = merchantMap.get(order.merchant_id);
      const url = new URL(`/commandes/${order.id}`, request.url).toString();
      return [
        enqueueEmail(admin, { dedupeKey: `order-created:${order.id}:buyer`, template: "order_created_buyer", to: user.email, recipientUserId: user.id, payload: { orderCode: order.public_code, totalXof: order.total_xof, merchantName: merchant?.public_name, url } }),
        enqueueEmail(admin, { dedupeKey: `order-created:${order.id}:merchant`, template: "order_created_merchant", to: merchant?.email, payload: { orderCode: order.public_code, merchantOrderCode: formatMerchantOrderNumber(order.merchant_sequence), totalXof: order.total_xof, url } }),
      ];
    }));
    return apiSuccess({
      ...result,
      totalXof: (orders ?? []).reduce((total, order) => total + order.total_xof, 0),
      orders: (orders ?? []).map((order) => ({
        id: order.id,
        publicCode: order.public_code,
        merchantId: order.merchant_id,
        merchantSequence: order.merchant_sequence,
        totalXof: order.total_xof,
        status: order.status,
      })),
    }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
