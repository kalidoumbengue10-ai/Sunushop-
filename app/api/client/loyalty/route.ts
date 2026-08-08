import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: accounts, error } = await admin
      .from("loyalty_accounts")
      .select("id, merchant_id, balance_points, lifetime_earned_points, lifetime_redeemed_points, merchant_accounts!inner(public_name, slug)")
      .eq("buyer_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const accountIds = (accounts ?? []).map((account) => account.id);
    if (!accountIds.length) return apiSuccess({ accounts: [], entries: [] }, { requestId });
    const [{ data: entries, error: entryError }, { data: lots, error: lotError }] = await Promise.all([
      admin
        .from("loyalty_entries")
        .select("id, account_id, order_id, kind, points_delta, balance_after, expires_at, created_at")
        .in("account_id", accountIds)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("loyalty_point_lots")
        .select("account_id, remaining_points, expires_at")
        .in("account_id", accountIds)
        .gt("remaining_points", 0)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at"),
    ]);
    if (entryError) throw entryError;
    if (lotError) throw lotError;
    return apiSuccess({
      accounts: (accounts ?? []).map((account) => ({
        ...account,
        availablePoints: Math.max(0, account.balance_points),
        debtPoints: Math.max(0, -account.balance_points),
        expiringLots: (lots ?? []).filter((lot) => lot.account_id === account.id),
      })),
      entries: entries ?? [],
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
