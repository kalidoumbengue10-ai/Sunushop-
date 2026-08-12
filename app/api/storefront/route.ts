import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";
import { isInSenegalBounds } from "@/lib/domain/geo";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const admin = requireAdminClient();
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(60, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "24", 10) || 24));
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lng"));
    const nearby = Number.isFinite(latitude) && Number.isFinite(longitude) && isInSenegalBounds({ latitude, longitude });
    const [catalogPage, categoryResult, mediaResult] = await Promise.all([
      new SupabaseCatalogRepository(admin).listPage({
        page,
        limit,
        query: url.searchParams.get("query")?.trim() || undefined,
        category: url.searchParams.get("category")?.trim() || undefined,
        merchantSlug: url.searchParams.get("merchant")?.trim() || undefined,
        region: url.searchParams.get("region")?.trim() || undefined,
        city: url.searchParams.get("city")?.trim() || undefined,
        latitude: nearby ? latitude : undefined,
        longitude: nearby ? longitude : undefined,
      }),
      admin.from("categories").select("id, slug, name, description").eq("active", true).order("position"),
      admin.from("merchant_media").select("merchant_id, kind, storage_bucket, storage_path"),
    ]);
    const products = catalogPage.products;
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
