import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const admin = requireAdminClient();
    const [products, categoryResult, mediaResult] = await Promise.all([
      new SupabaseCatalogRepository(admin).list({ limit: 100 }),
      admin.from("categories").select("id, slug, name, description").eq("active", true).order("position"),
      admin.from("merchant_media").select("merchant_id, kind, storage_bucket, storage_path"),
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
      id: string; name: string; slug: string; city: string | null;
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
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
