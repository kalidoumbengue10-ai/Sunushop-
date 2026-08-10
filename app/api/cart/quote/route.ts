import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { calculateLoyaltyQuote } from "@/lib/domain/loyalty";
import { cartQuoteSchema } from "@/lib/domain/schemas";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = cartQuoteSchema.parse(await request.json());
    const admin = requireAdminClient();
    const repository = new SupabaseCatalogRepository(admin);
    const groups = await repository.quote(input.groups);
    const supabase = await getServerSupabase();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const merchantIds = input.groups.map((group) => group.merchantId);
    const [{ data: accounts }, { data: settings }] = user
      ? await Promise.all([
          admin.from("loyalty_accounts").select("merchant_id, balance_points").eq("buyer_id", user.id).in("merchant_id", merchantIds),
          admin.from("merchant_loyalty_settings").select("merchant_id, accrual_enabled").in("merchant_id", merchantIds),
        ])
      : [{ data: [] }, { data: [] }];
    const balances = new Map((accounts ?? []).map((account) => [account.merchant_id, account.balance_points]));
    const enabled = new Map((settings ?? []).map((setting) => [setting.merchant_id, setting.accrual_enabled]));
    const decorated = groups.map((group) => {
      const requested = input.groups.find((item) => item.merchantId === group.merchantId);
      const loyalty = calculateLoyaltyQuote(group.subtotalXof, balances.get(group.merchantId) ?? 0, requested?.applyLoyalty ?? true);
      return {
        ...group,
        ...loyalty,
        loyaltyAccrualEnabled: enabled.get(group.merchantId) ?? false,
        totalXof: group.subtotalXof - loyalty.loyaltyDiscountXof + group.deliveryFeeXof,
      };
    });
    return apiSuccess({
      groups: decorated,
      totalXof: decorated.reduce((total, group) => total + group.totalXof, 0),
      quotedAt: new Date().toISOString(),
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
