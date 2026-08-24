import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { shopFollowInputSchema } from "@/lib/domain/schemas";
import { attachShopBranding, requirePublicShop, type ShopSummaryInput } from "@/lib/marketplace/shop-summaries";
import { parseJsonBody } from "@/lib/api/json";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("shop_favorites")
      .select("id, merchant_id, created_at, merchant_accounts!inner(id, public_name, slug, city, region)")
      .eq("buyer_id", user.id)
      .eq("merchant_accounts.status", "active")
      .in("merchant_accounts.subscription_status", ["active", "grace"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    const shops = await attachShopBranding(
      admin,
      rows.flatMap((row) => {
        const merchant = Array.isArray(row.merchant_accounts) ? row.merchant_accounts[0] : row.merchant_accounts;
        return merchant ? [merchant as ShopSummaryInput] : [];
      }),
    );
    const shopById = new Map(shops.map((shop) => [shop.id, shop]));
    return apiSuccess({
      items: rows.flatMap((row) => {
        const shop = shopById.get(row.merchant_id);
        return shop ? [{ relationId: row.id, merchantId: row.merchant_id, createdAt: row.created_at, shop }] : [];
      }),
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = shopFollowInputSchema.parse(await parseJsonBody(request));
    const { user } = await requireUser();
    const admin = requireAdminClient();
    await requirePublicShop(admin, input.merchantId);
    const { error } = await admin
      .from("shop_favorites")
      .upsert({ buyer_id: user.id, merchant_id: input.merchantId }, { onConflict: "buyer_id,merchant_id" });
    if (error) throw error;
    return apiSuccess({ favorite: true }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = shopFollowInputSchema.parse(await parseJsonBody(request));
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { error } = await admin
      .from("shop_favorites")
      .delete()
      .eq("buyer_id", user.id)
      .eq("merchant_id", input.merchantId);
    if (error) throw error;
    return apiSuccess({ favorite: false }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
