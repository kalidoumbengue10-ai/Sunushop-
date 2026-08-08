import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const admin = requireAdminClient();
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim() || undefined;
    const category = url.searchParams.get("category")?.trim() || undefined;
    const region = url.searchParams.get("region")?.trim() || undefined;
    const city = url.searchParams.get("city")?.trim() || undefined;
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(60, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "24", 10) || 24));

    const productPage = await new SupabaseCatalogRepository(admin).listPage({
      page,
      limit,
      query,
      category,
      region,
      city,
    });

    let shopRequest = admin
      .from("merchant_accounts")
      .select("id, public_name, slug, city, region")
      .eq("status", "active")
      .in("subscription_status", ["active", "grace"])
      .order("public_name")
      .limit(limit);
    if (query) shopRequest = shopRequest.ilike("public_name", `%${query.replaceAll("%", "\\%")}%`);
    if (region) shopRequest = shopRequest.eq("region", region);
    if (city) shopRequest = shopRequest.ilike("city", city);
    const { data: shops, error: shopsError } = await shopRequest;
    if (shopsError) throw shopsError;

    return apiSuccess(
      {
        products: productPage.products,
        shops: shops ?? [],
        pagination: {
          page: productPage.page,
          limit: productPage.limit,
          total: productPage.total,
          hasMore: productPage.page * productPage.limit < productPage.total,
        },
      },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
