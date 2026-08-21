import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";
import { searchQuerySchema } from "@/lib/domain/schemas";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const admin = requireAdminClient();
    const url = new URL(request.url);
    const input = searchQuerySchema.parse({
      query: url.searchParams.get("query") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const productPage = await new SupabaseCatalogRepository(admin).listPage({
      page: input.page,
      limit: input.limit,
      query: input.query,
      category: input.category,
      region: input.region,
      city: input.city,
    });

    let shopRequest = admin
      .from("merchant_accounts")
      .select("id, public_name, slug, city, region")
      .eq("status", "active")
      .in("subscription_status", ["active", "grace"])
      .order("public_name")
      .limit(input.limit);
    if (input.query) shopRequest = shopRequest.ilike("public_name", `%${input.query.replaceAll("%", "\\%")}%`);
    if (input.region) shopRequest = shopRequest.eq("region", input.region);
    if (input.city) shopRequest = shopRequest.ilike("city", input.city);
    const [{ data: shops, error: shopsError }, { data: categories, error: categoriesError }] = await Promise.all([
      shopRequest,
      admin.from("categories").select("id, name, slug").eq("active", true).order("position"),
    ]);
    if (shopsError) throw shopsError;
    if (categoriesError) throw categoriesError;

    return apiSuccess(
      {
        products: productPage.products,
        shops: shops ?? [],
        filters: { categories: categories ?? [] },
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
