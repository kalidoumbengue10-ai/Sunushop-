import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { adminAnalyticsQuerySchema } from "@/lib/domain/schemas";
import { previousRangeFor } from "@/lib/domain/analytics-period";

type PeriodAnalytics = {
  subscription_revenue_xof: number;
  approved_payments_count: number;
  delivered_units: number;
  product_revenue_xof: number;
  top_sellers: Array<{ merchantId: string; merchantName: string; units: number; revenueXof: number }>;
};

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const input = adminAnalyticsQuerySchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const { supabase } = await requireAdminRole(["admin", "support"]);
    const { previousFrom, previousTo } = previousRangeFor(input.from, input.to);

    const [currentResult, previousResult] = await Promise.all([
      supabase.rpc("admin_period_analytics", { p_from: input.from, p_to: input.to }),
      supabase.rpc("admin_period_analytics", { p_from: previousFrom, p_to: previousTo }),
    ]);
    if (currentResult.error) throw currentResult.error;
    if (previousResult.error) throw previousResult.error;

    const current = (currentResult.data as PeriodAnalytics[])[0];
    const previous = (previousResult.data as PeriodAnalytics[])[0];

    return apiSuccess({
      period: { from: input.from, to: input.to, previousFrom, previousTo },
      summary: {
        subscriptionRevenueXof: current.subscription_revenue_xof,
        approvedPaymentsCount: current.approved_payments_count,
        deliveredUnits: current.delivered_units,
        productRevenueXof: current.product_revenue_xof,
        previousSubscriptionRevenueXof: previous.subscription_revenue_xof,
        subscriptionRevenueChangePercent: previous.subscription_revenue_xof
          ? Math.round(((current.subscription_revenue_xof - previous.subscription_revenue_xof) / previous.subscription_revenue_xof) * 1000) / 10
          : null,
        previousProductRevenueXof: previous.product_revenue_xof,
        productRevenueChangePercent: previous.product_revenue_xof
          ? Math.round(((current.product_revenue_xof - previous.product_revenue_xof) / previous.product_revenue_xof) * 1000) / 10
          : null,
      },
      topSellers: current.top_sellers ?? [],
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
