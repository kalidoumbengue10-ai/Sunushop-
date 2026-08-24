import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";

export type ShopSummaryInput = {
  id: string;
  public_name: string;
  slug: string;
  city: string | null;
  region: string | null;
};

export type PublicShopSummary = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  region: string | null;
  categories: string[];
  logoUrl: string | null;
  coverUrl: string | null;
};

export async function attachShopBranding(
  client: SupabaseClient,
  shops: ShopSummaryInput[],
): Promise<PublicShopSummary[]> {
  const merchantIds = [...new Set(shops.map((shop) => shop.id))];
  const { data: media, error } = merchantIds.length
    ? await client
        .from("merchant_media")
        .select("merchant_id, kind, storage_bucket, storage_path")
        .in("merchant_id", merchantIds)
    : { data: [], error: null };
  if (error) throw error;

  const branding = new Map<string, { logoUrl: string | null; coverUrl: string | null }>();
  for (const item of media ?? []) {
    const current = branding.get(item.merchant_id) ?? { logoUrl: null, coverUrl: null };
    const publicUrl = client.storage.from(item.storage_bucket).getPublicUrl(item.storage_path).data.publicUrl;
    if (item.kind === "logo") current.logoUrl = publicUrl;
    if (item.kind === "cover") current.coverUrl = publicUrl;
    branding.set(item.merchant_id, current);
  }

  return shops.map((shop) => ({
    id: shop.id,
    name: shop.public_name,
    slug: shop.slug,
    city: shop.city,
    region: shop.region,
    categories: [],
    ...(branding.get(shop.id) ?? { logoUrl: null, coverUrl: null }),
  }));
}

export async function requirePublicShop(client: SupabaseClient, merchantId: string) {
  const { data, error } = await client
    .from("merchant_accounts")
    .select("id")
    .eq("id", merchantId)
    .eq("status", "active")
    .in("subscription_status", ["active", "grace"])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "SHOP_NOT_FOUND", "Cette boutique n’est pas disponible.");
}

