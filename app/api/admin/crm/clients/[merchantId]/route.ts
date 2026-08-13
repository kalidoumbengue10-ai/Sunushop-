import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { adminAnalyticsQuerySchema } from "@/lib/domain/schemas";
import { isRevenueOrder, netOrderVolume } from "@/lib/domain/admin-analytics";

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireAdminRole(["support", "admin"]);
    const admin = requireAdminClient();
    const { merchantId } = await context.params;
    const url = new URL(request.url);
    const now = new Date();
    const input = adminAnalyticsQuerySchema.parse({
      from: url.searchParams.get("from") ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`,
      to: url.searchParams.get("to") ?? new Date(now.getTime() + 86_400_000).toISOString(),
    });

    const { data: merchant, error: merchantError } = await (admin as any)
      .from("merchant_accounts")
      .select("id, public_name, legal_name, kind, description, email, phone, region, city, address_hint, ninea, rccm, status, verification_status, subscription_status, customer_since, created_at")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant?.customer_since) throw new ApiError(404, "CRM_CLIENT_NOT_FOUND", "Client commerçant introuvable.");

    const [subscriptionsResult, leadsResult, documentsResult, ordersResult, recentOrdersResult, refundsResult, valuesResult, rolesResult] = await Promise.all([
      admin.from("merchant_subscriptions")
        .select("id, plan_id, status, starts_at, current_period_ends_at, grace_ends_at, cancelled_at, billing_cycle, created_at, subscription_plans(name, monthly_price_xof)")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false }),
      admin.from("crm_leads")
        .select("id, full_name, business_name, email, phone, city, business_type, sales_channel, message, status, priority, converted_at, created_at, crm_lead_notes(id, body, author_id, created_at), crm_lead_events(id, event_type, from_status, to_status, summary, created_at)")
        .eq("merchant_id", merchantId)
        .order("updated_at", { ascending: false }),
      admin.from("verification_documents")
        .select("id, case_id, document_type, version, status, mime_type, size_bytes, uploaded_at, reviewed_at, purged_at")
        .eq("merchant_id", merchantId)
        .order("uploaded_at", { ascending: false }),
      (admin as any).from("orders")
        .select("id, public_code, status, payment_status, total_xof, created_at, paid_at, delivered_at")
        .eq("merchant_id", merchantId)
        .gte("paid_at", input.from)
        .lt("paid_at", input.to)
        .order("paid_at", { ascending: false }),
      (admin as any).from("orders")
        .select("id, public_code, status, payment_status, total_xof, created_at, paid_at, delivered_at")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false }),
      admin.from("order_refunds")
        .select("amount_xof, status, reviewed_at, declared_at")
        .eq("merchant_id", merchantId)
        .eq("status", "confirmed")
        .gte("reviewed_at", input.from)
        .lt("reviewed_at", input.to),
      (admin as any).from("subscription_value_ledger")
        .select("id, plan_id, origin, amount_xof, recognized_at, metadata")
        .eq("merchant_id", merchantId)
        .order("recognized_at", { ascending: false }),
      admin.from("admin_roles").select("role").eq("user_id", user.id).eq("active", true),
    ]);

    for (const result of [subscriptionsResult, leadsResult, documentsResult, ordersResult, recentOrdersResult, refundsResult, valuesResult, rolesResult]) {
      if (result.error) throw result.error;
    }

    const orders = ordersResult.data ?? [];
    const paidOrders = orders.filter((order: any) => isRevenueOrder(order));
    const paidOrderIds = paidOrders.map((order: any) => order.id);
    let paidItems: any[] = [];
    if (paidOrderIds.length) {
      const { data, error } = await admin.from("order_items")
        .select("product_id, quantity, line_total_xof, products(id, title, categories(id, name))")
        .in("order_id", paidOrderIds);
      if (error) throw error;
      paidItems = data ?? [];
    }

    const productTotals = new Map<string, { productId: string; productName: string; units: number; revenueXof: number }>();
    const categoryTotals = new Map<string, { categoryId: string; categoryName: string; units: number; revenueXof: number }>();
    for (const item of paidItems) {
      const product = one(item.products) as any;
      const category = one(product?.categories) as any;
      const productCurrent = productTotals.get(item.product_id) ?? { productId: item.product_id, productName: product?.title ?? "Produit", units: 0, revenueXof: 0 };
      productCurrent.units += item.quantity;
      productCurrent.revenueXof += item.line_total_xof;
      productTotals.set(item.product_id, productCurrent);
      if (category) {
        const categoryCurrent = categoryTotals.get(category.id) ?? { categoryId: category.id, categoryName: category.name, units: 0, revenueXof: 0 };
        categoryCurrent.units += item.quantity;
        categoryCurrent.revenueXof += item.line_total_xof;
        categoryTotals.set(category.id, categoryCurrent);
      }
    }

    const refundsXof = (refundsResult.data ?? []).reduce((sum, refund) => sum + refund.amount_xof, 0);
    const grossOrderVolumeXof = paidOrders.reduce((sum: number, order: any) => sum + order.total_xof, 0);
    const documents = (documentsResult.data ?? []).reduce<Record<string, any[]>>((groups, document) => {
      (groups[document.document_type] ??= []).push(document);
      return groups;
    }, {});

    return apiSuccess({
      merchant,
      contact: one(leadsResult.data),
      subscriptions: subscriptionsResult.data ?? [],
      subscriptionValues: valuesResult.data ?? [],
      documents,
      metrics: {
        paidOrdersCount: paidOrders.length,
        paidUnits: paidItems.reduce((sum, item) => sum + item.quantity, 0),
        grossOrderVolumeXof,
        refundsXof,
        netOrderVolumeXof: netOrderVolume(grossOrderVolumeXof, refundsXof),
      },
      topProducts: [...productTotals.values()].sort((a, b) => b.units - a.units || b.revenueXof - a.revenueXof).slice(0, 10),
      topCategories: [...categoryTotals.values()].sort((a, b) => b.units - a.units || b.revenueXof - a.revenueXof).slice(0, 10),
      recentOrders: (recentOrdersResult.data ?? []).slice(0, 10),
      canViewDocuments: (rolesResult.data ?? []).some((role) => role.role === "admin" || role.role === "reviewer"),
      period: input,
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
