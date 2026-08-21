import { requireAdminClient } from "@/lib/api/auth";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/api/security";
import { merchantAnalyticsQuerySchema } from "@/lib/domain/schemas";

type Granularity = "day" | "week" | "month" | "year";

function bucketStart(value: string, granularity: Granularity) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  if (granularity === "week") {
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - weekday + 1);
  } else if (granularity === "month") {
    date.setUTCDate(1);
  } else if (granularity === "year") {
    date.setUTCMonth(0, 1);
  }
  return date.toISOString();
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const input = merchantAnalyticsQuerySchema.parse({
      merchantId: url.searchParams.get("merchantId"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      granularity: url.searchParams.get("granularity") ?? "day",
    });
    await requireActiveMerchantAccess(input.merchantId, ["owner", "manager"]);
    // Route coûteuse (jusqu'à 15 000 lignes agrégées en JavaScript par
    // appel) : bornée en plus de la limite de période sur le schéma.
    await enforceRateLimit({ key: `merchant:${input.merchantId}`, action: "merchant_analytics", windowSeconds: 60, maxRequests: 20 });
    const admin = requireAdminClient();
    const duration = new Date(input.to).getTime() - new Date(input.from).getTime();
    const previousFrom = new Date(new Date(input.from).getTime() - duration).toISOString();
    const previousTo = input.from;

    const [createdResult, deliveredResult, previousResult, inventoryResult] = await Promise.all([
      admin.from("orders")
        .select("id, status, created_at")
        .eq("merchant_id", input.merchantId)
        .gte("created_at", input.from).lt("created_at", input.to)
        .order("created_at").limit(5000),
      admin.from("orders")
        .select("id, total_xof, subtotal_xof, delivery_fee_xof, delivered_at, status, order_items(product_id, quantity, unit_price_xof, product_snapshot)")
        .eq("merchant_id", input.merchantId)
        .not("delivered_at", "is", null)
        .gte("delivered_at", input.from).lt("delivered_at", input.to)
        .neq("status", "disputed")
        .order("delivered_at").limit(5000),
      admin.from("orders")
        .select("total_xof, delivery_fee_xof")
        .eq("merchant_id", input.merchantId)
        .not("delivered_at", "is", null)
        .gte("delivered_at", previousFrom).lt("delivered_at", previousTo)
        .neq("status", "disputed").limit(5000),
      admin.from("product_variants")
        .select("id, title, products!inner(id, title), inventory_items!inner(available_quantity, reserved_quantity, low_stock_threshold)")
        .eq("merchant_id", input.merchantId).eq("active", true),
    ]);
    for (const result of [createdResult, deliveredResult, previousResult, inventoryResult]) {
      if (result.error) throw result.error;
    }

    const created = createdResult.data ?? [];
    const delivered = deliveredResult.data ?? [];
    const revenueXof = delivered.reduce((sum, order) => sum + order.total_xof, 0);
    const deliveryRevenueXof = delivered.reduce((sum, order) => sum + order.delivery_fee_xof, 0);
    const previousRevenueXof = (previousResult.data ?? []).reduce((sum, order) => sum + order.total_xof, 0);
    const series = new Map<string, { periodStart: string; revenueXof: number; deliveredOrders: number; createdOrders: number }>();
    const ensureBucket = (date: string) => {
      const key = bucketStart(date, input.granularity);
      if (!series.has(key)) series.set(key, { periodStart: key, revenueXof: 0, deliveredOrders: 0, createdOrders: 0 });
      return series.get(key)!;
    };
    created.forEach((order) => { ensureBucket(order.created_at).createdOrders += 1; });
    delivered.forEach((order) => {
      const bucket = ensureBucket(order.delivered_at!);
      bucket.revenueXof += order.total_xof;
      bucket.deliveredOrders += 1;
    });

    const products = new Map<string, { productId: string; title: string; unitsSold: number; revenueXof: number }>();
    delivered.forEach((order) => {
      (order.order_items ?? []).forEach((item) => {
        const snapshot = item.product_snapshot as { title?: string } | null;
        const current = products.get(item.product_id) ?? { productId: item.product_id, title: snapshot?.title ?? "Produit", unitsSold: 0, revenueXof: 0 };
        current.unitsSold += item.quantity;
        current.revenueXof += item.quantity * item.unit_price_xof;
        products.set(item.product_id, current);
      });
    });
    const topProducts = [...products.values()].sort((a, b) => b.unitsSold - a.unitsSold || b.revenueXof - a.revenueXof);
    const statusCounts = Object.fromEntries([...new Set(created.map((order) => order.status))].map((status) => [status, created.filter((order) => order.status === status).length]));
    const lowStock = (inventoryResult.data ?? []).flatMap((variant) => {
      const inventory = Array.isArray(variant.inventory_items) ? variant.inventory_items[0] : variant.inventory_items;
      const product = Array.isArray(variant.products) ? variant.products[0] : variant.products;
      const sellable = Math.max(0, (inventory?.available_quantity ?? 0) - (inventory?.reserved_quantity ?? 0));
      return sellable <= (inventory?.low_stock_threshold ?? 0) ? [{ variantId: variant.id, title: product?.title ?? variant.title ?? "Produit", variantTitle: variant.title, sellable, threshold: inventory?.low_stock_threshold ?? 0 }] : [];
    });

    return apiSuccess({
      period: { from: input.from, to: input.to, previousFrom, previousTo, granularity: input.granularity },
      summary: {
        revenueXof,
        productRevenueXof: revenueXof - deliveryRevenueXof,
        deliveryRevenueXof,
        deliveredOrders: delivered.length,
        createdOrders: created.length,
        averageOrderXof: delivered.length ? Math.round(revenueXof / delivered.length) : 0,
        previousRevenueXof,
        revenueChangePercent: previousRevenueXof ? Math.round(((revenueXof - previousRevenueXof) / previousRevenueXof) * 1000) / 10 : null,
      },
      statusCounts,
      series: [...series.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
      topProducts: topProducts.slice(0, 10),
      lowStock,
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
