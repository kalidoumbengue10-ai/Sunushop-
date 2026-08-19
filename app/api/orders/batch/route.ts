import * as Sentry from "@sentry/nextjs";
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

    // À partir d'ici, la commande est déjà créée et committée en base par le RPC.
    // Toute erreur ci-dessous (relecture, envoi d'emails) ne doit plus faire échouer
    // la requête côté client : ça créerait une commande "fantôme" pour l'acheteur,
    // qui verrait une erreur alors que sa commande a bien été passée.
    const admin = requireAdminClient();
    let orders: Array<{
      id: string;
      public_code: string;
      merchant_id: string;
      merchant_sequence: number;
      subtotal_xof: number;
      total_xof: number;
      status: string;
      loyalty_points_redeemed: number | null;
      loyalty_discount_xof: number | null;
      loyalty_points_earned: number | null;
    }> = [];
    try {
      const { data: fetchedOrders, error: ordersError } = await admin
        .from("orders")
        .select("id, public_code, merchant_id, merchant_sequence, subtotal_xof, total_xof, status, loyalty_points_redeemed, loyalty_discount_xof, loyalty_points_earned")
        .eq("batch_id", result.batchId)
        .order("created_at");
      if (ordersError) throw ordersError;
      orders = fetchedOrders ?? [];
    } catch (postCommitError) {
      console.error("[order_batch_post_commit_read_failed]", {
        requestId,
        batchId: result.batchId,
        message: postCommitError instanceof Error ? postCommitError.message : String(postCommitError),
      });
      Sentry.captureException(postCommitError, {
        tags: { requestId, errorCode: "ORDER_BATCH_POST_COMMIT_READ_FAILED" },
        extra: { batchId: result.batchId },
      });
    }
    const merchantIds = [...new Set(orders.map((order) => order.merchant_id))];
    const { data: merchants } = await admin.from("merchant_accounts").select("id, public_name, email").in("id", merchantIds);
    const merchantMap = new Map((merchants ?? []).map((merchant) => [merchant.id, merchant]));
    await Promise.allSettled(orders.flatMap((order) => {
      const merchant = merchantMap.get(order.merchant_id);
      const url = new URL(`/commandes/${order.id}`, request.url).toString();
      return [
        enqueueEmail(admin, { dedupeKey: `order-created:${order.id}:buyer`, template: "order_created_buyer", to: user.email, recipientUserId: user.id, payload: { orderCode: order.public_code, totalXof: order.total_xof, merchantName: merchant?.public_name, url } }),
        enqueueEmail(admin, { dedupeKey: `order-created:${order.id}:merchant`, template: "order_created_merchant", to: merchant?.email, payload: { orderCode: order.public_code, merchantOrderCode: formatMerchantOrderNumber(order.merchant_sequence), totalXof: order.total_xof, url } }),
      ];
    }));
    return apiSuccess({
      ...result,
      totalXof: orders.length > 0 ? orders.reduce((total, order) => total + order.total_xof, 0) : result.totalXof,
      orders: orders.map((order) => ({
        id: order.id,
        publicCode: order.public_code,
        merchantId: order.merchant_id,
        merchantSequence: order.merchant_sequence,
        totalXof: order.total_xof,
        status: order.status,
        loyaltyPointsRedeemed: order.loyalty_points_redeemed,
        loyaltyDiscountXof: order.loyalty_discount_xof,
        loyaltyPointsEarnable: Math.floor((order.subtotal_xof - (order.loyalty_discount_xof ?? 0)) / 100),
      })),
    }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
