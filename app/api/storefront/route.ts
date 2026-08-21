import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";
import { isInSenegalBounds } from "@/lib/domain/geo";
import { storefrontQuerySchema } from "@/lib/domain/schemas";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const admin = requireAdminClient();
    const url = new URL(request.url);
    const input = storefrontQuerySchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      merchantSlug: url.searchParams.get("merchant") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      city: url.searchParams.get("city") ?? undefined,
      lat: url.searchParams.get("lat") ?? undefined,
      lng: url.searchParams.get("lng") ?? undefined,
    });
    const nearby = input.lat !== undefined && input.lng !== undefined && isInSenegalBounds({ latitude: input.lat, longitude: input.lng });
    const catalogPage = await new SupabaseCatalogRepository(admin).listPage({
      page: input.page,
      limit: input.limit,
      query: input.query,
      category: input.category,
      merchantSlug: input.merchantSlug,
      region: input.region,
      city: input.city,
      latitude: nearby ? input.lat : undefined,
      longitude: nearby ? input.lng : undefined,
    });
    const products = catalogPage.products;
    const merchantIds = [...new Set(products.map((product) => product.merchant.id))];
    const [categoryResult, mediaResult] = await Promise.all([
      admin.from("categories").select("id, slug, name, description").eq("active", true).order("position"),
      merchantIds.length
        ? admin.from("merchant_media").select("merchant_id, kind, storage_bucket, storage_path").in("merchant_id", merchantIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (categoryResult.error) throw categoryResult.error;
    if (mediaResult.error) throw mediaResult.error;
    const media = new Map<string, { logoUrl: string | null; coverUrl: string | null }>();
    for (const item of mediaResult.data ?? []) {
      const current = media.get(item.merchant_id) ?? { logoUrl: null, coverUrl: null };
      const url = admin.storage.from(item.storage_bucket).getPublicUrl(item.storage_path).data.publicUrl;
      if (item.kind === "logo") current.logoUrl = url;
      else current.coverUrl = url;
      media.set(item.merchant_id, current);
    }
    const shops = new Map<string, {
      id: string; name: string; slug: string; city: string | null; distanceKm?: number | null;
      logoUrl: string | null; coverUrl: string | null;
      categories: Map<string, { id: string; slug: string; name: string }>;
      productCount: number;
    }>();
    for (const product of products) {
      const shop = shops.get(product.merchant.id) ?? {
        id: product.merchant.id,
        name: product.merchant.name,
        slug: product.merchant.slug,
        city: product.merchant.city,
        distanceKm: product.merchant.distanceKm,
        ...(media.get(product.merchant.id) ?? { logoUrl: null, coverUrl: null }),
        categories: new Map(),
        productCount: 0,
      };
      shop.categories.set(product.category.id, product.category);
      shop.productCount += 1;
      shops.set(shop.id, shop);
    }
    return apiSuccess({
      categories: categoryResult.data ?? [],
      shops: [...shops.values()].map((shop) => ({ ...shop, categories: [...shop.categories.values()] })),
      products,
      pagination: {
        page: catalogPage.page,
        limit: catalogPage.limit,
        total: catalogPage.total,
        hasMore: catalogPage.page * catalogPage.limit < catalogPage.total,
      },
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
