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
    const groups = await repository.quote(input.groups, input.destination);
    const supabase = await getServerSupabase();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const merchantIds = input.groups.map((group) => group.merchantId);
    const { data: accounts } = user
      ? await admin.from("loyalty_accounts").select("merchant_id, balance_points").eq("buyer_id", user.id).in("merchant_id", merchantIds)
      : { data: [] };
    const balances = new Map((accounts ?? []).map((account) => [account.merchant_id, account.balance_points]));
    const decorated = groups.map((group) => {
      const loyalty = calculateLoyaltyQuote(group.subtotalXof, balances.get(group.merchantId) ?? 0, false);
      return {
        ...group,
        ...loyalty,
        pointsEarnable: 0,
        loyaltyAccrualEnabled: false,
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
