import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { loyaltySettingSchema } from "@/lib/domain/schemas";

async function requireLoyaltyAccess(merchantId: string, write = false) {
  const { user, supabase } = await requireUser();
  const roles = write ? ["owner", "manager"] : ["owner", "manager", "fulfillment"];
  const { data } = await supabase
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", merchantId)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", roles)
    .maybeSingle();
  if (!data) throw new ApiError(403, "FORBIDDEN", "Accès refusé.");
  return user;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    await requireLoyaltyAccess(merchantId);
    const admin = requireAdminClient();
    const [{ data: settings, error: settingsError }, { data: accounts, error: accountsError }, { data: contributions, error: contributionsError }, { data: payouts, error: payoutsError }] = await Promise.all([
      admin.from("merchant_loyalty_settings").select("merchant_id, accrual_enabled, earn_xof_per_point, point_value_xof, max_redemption_bps, merchant_funding_bps, platform_funding_bps").eq("merchant_id", merchantId).maybeSingle(),
      admin.from("loyalty_accounts").select("id, buyer_id, balance_points, lifetime_earned_points, lifetime_redeemed_points, updated_at").eq("merchant_id", merchantId).order("updated_at", { ascending: false }).limit(200),
      admin.from("loyalty_contributions").select("id, order_id, kind, discount_xof, merchant_share_xof, platform_share_xof, payout_id, created_at").eq("merchant_id", merchantId).order("created_at", { ascending: false }).limit(200),
      admin.from("loyalty_credit_payouts").select("id, period_start, period_end, amount_xof, service, status, created_at, paid_at").eq("merchant_id", merchantId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (settingsError) throw settingsError;
    if (accountsError) throw accountsError;
    if (contributionsError) throw contributionsError;
    if (payoutsError) throw payoutsError;
    const buyerIds = (accounts ?? []).map((account) => account.buyer_id);
    const { data: recentOrders, error: ordersError } = buyerIds.length
      ? await admin.from("orders").select("buyer_id, recipient_snapshot, created_at").eq("merchant_id", merchantId).in("buyer_id", buyerIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (ordersError) throw ordersError;
    const names = new Map<string, string>();
    for (const order of recentOrders ?? []) {
      if (!names.has(order.buyer_id)) names.set(order.buyer_id, String((order.recipient_snapshot as { name?: string })?.name ?? "Client"));
    }
    return apiSuccess({
      settings: settings ?? {
        merchant_id: merchantId,
        accrual_enabled: false,
        earn_xof_per_point: 100,
        point_value_xof: 1,
        max_redemption_bps: 2000,
        merchant_funding_bps: 5000,
        platform_funding_bps: 5000,
      },
      accounts: (accounts ?? []).map((account) => ({ ...account, customerName: names.get(account.buyer_id) ?? "Client" })),
      contributions: contributions ?? [],
      payouts: payouts ?? [],
      totals: {
        customers: accounts?.length ?? 0,
        outstandingPoints: (accounts ?? []).reduce((sum, account) => sum + Math.max(0, account.balance_points), 0),
        platformContributionXof: (contributions ?? []).reduce((sum, contribution) => sum + contribution.platform_share_xof, 0),
      },
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = loyaltySettingSchema.parse(await request.json());
    const user = await requireLoyaltyAccess(input.merchantId, true);
    const admin = requireAdminClient();
    const { data, error } = await admin.from("merchant_loyalty_settings").upsert({
      merchant_id: input.merchantId,
      accrual_enabled: input.accrualEnabled,
      updated_by: user.id,
    }, { onConflict: "merchant_id" }).select("merchant_id, accrual_enabled").single();
    if (error) throw error;
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: input.merchantId,
      action: input.accrualEnabled ? "loyalty.enable" : "loyalty.disable",
      entity_type: "merchant_loyalty_settings",
      entity_id: input.merchantId,
      request_id: requestId,
    });
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
