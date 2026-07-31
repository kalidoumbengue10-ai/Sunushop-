import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import type {
  CatalogItem,
  CatalogRepository,
  PublicShop,
  QuoteGroup,
  QuoteRequestGroup,
} from "@/lib/domain/repositories";

type RawProduct = {
  id: string;
  title: string;
  slug: string;
  description: string;
  merchant_accounts: {
    id: string;
    public_name: string;
    slug: string;
    city: string | null;
  };
  categories: { id: string; name: string; slug: string };
  product_variants: Array<{
    id: string;
    sku: string;
    title: string | null;
    price_xof: number;
    compare_at_price_xof: number | null;
    inventory_items:
      | { available_quantity: number; reserved_quantity: number }
      | Array<{ available_quantity: number; reserved_quantity: number }>;
  }>;
  product_media: Array<{ storage_bucket: string; storage_path: string; position: number }>;
};

const productSelection = `
  id,
  title,
  slug,
  description,
  merchant_accounts!inner(id, public_name, slug, city),
  categories!inner(id, name, slug),
  product_variants!inner(
    id,
    sku,
    title,
    price_xof,
    compare_at_price_xof,
    inventory_items!inner(available_quantity, reserved_quantity)
  ),
  product_media(storage_bucket, storage_path, position)
`;

function firstInventory(
  value: RawProduct["product_variants"][number]["inventory_items"],
) {
  return Array.isArray(value) ? value[0] : value;
}

function mapProduct(
  client: SupabaseClient,
  product: RawProduct,
): CatalogItem | null {
  const variant = product.product_variants[0];
  if (!variant) return null;
  const inventory = firstInventory(variant.inventory_items);
  const media = [...(product.product_media ?? [])].sort(
    (a, b) => a.position - b.position,
  )[0];

  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    description: product.description,
    category: {
      id: product.categories.id,
      name: product.categories.name,
      slug: product.categories.slug,
    },
    merchant: {
      id: product.merchant_accounts.id,
      name: product.merchant_accounts.public_name,
      slug: product.merchant_accounts.slug,
      city: product.merchant_accounts.city,
    },
    variant: {
      id: variant.id,
      sku: variant.sku,
      title: variant.title,
      priceXof: variant.price_xof,
      compareAtPriceXof: variant.compare_at_price_xof,
      availableQuantity: Math.max(
        0,
        (inventory?.available_quantity ?? 0) -
          (inventory?.reserved_quantity ?? 0),
      ),
    },
    imageUrl: media
      ? client.storage.from(media.storage_bucket).getPublicUrl(media.storage_path)
          .data.publicUrl
      : null,
  };
}

export class SupabaseCatalogRepository implements CatalogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(input: {
    query?: string;
    category?: string;
    limit: number;
  }) {
    let request = this.client
      .from("products")
      .select(productSelection)
      .eq("status", "published")
      .eq("merchant_accounts.status", "active")
      .eq("merchant_accounts.verification_status", "approved")
      .in("merchant_accounts.subscription_status", ["active", "grace"])
      .order("published_at", { ascending: false })
      .limit(input.limit);

    if (input.query) request = request.ilike("title", `%${input.query}%`);
    if (input.category) {
      request = request.eq("categories.slug", input.category);
    }

    const { data, error } = await request;
    if (error) throw error;

    return ((data ?? []) as unknown as RawProduct[])
      .map((product) => mapProduct(this.client, product))
      .filter((product): product is CatalogItem => product !== null);
  }

  async findShopBySlug(slug: string): Promise<PublicShop | null> {
    const { data: merchant, error: merchantError } = await this.client
      .from("merchant_accounts")
      .select(
        "id, public_name, slug, description, region, city, wave_payment_number, orange_money_payment_number",
      )
      .eq("slug", slug)
      .eq("status", "active")
      .eq("verification_status", "approved")
      .in("subscription_status", ["active", "grace"])
      .maybeSingle();

    if (merchantError) throw merchantError;
    if (!merchant) return null;

    const [{ data: products, error: productsError }, { data: zones, error: zonesError }] =
      await Promise.all([
        this.client
          .from("products")
          .select(productSelection)
          .eq("merchant_id", merchant.id)
          .eq("status", "published")
          .order("published_at", { ascending: false }),
        this.client
          .from("delivery_zones")
          .select(
            "id, label, region, city, fee_xof, min_delay_minutes, max_delay_minutes",
          )
          .eq("merchant_id", merchant.id)
          .eq("active", true)
          .order("fee_xof"),
      ]);

    if (productsError) throw productsError;
    if (zonesError) throw zonesError;

    return {
      id: merchant.id,
      name: merchant.public_name,
      slug: merchant.slug,
      description: merchant.description,
      region: merchant.region,
      city: merchant.city,
      paymentMethods: {
        cashOnDelivery: true,
        wave: Boolean(merchant.wave_payment_number),
        orangeMoney: Boolean(merchant.orange_money_payment_number),
      },
      deliveryZones: (zones ?? []).map((zone) => ({
        id: zone.id,
        label: zone.label,
        region: zone.region,
        city: zone.city,
        feeXof: zone.fee_xof,
        minDelayMinutes: zone.min_delay_minutes,
        maxDelayMinutes: zone.max_delay_minutes,
      })),
      products: ((products ?? []) as unknown as RawProduct[])
        .map((product) => mapProduct(this.client, product))
        .filter((product): product is CatalogItem => product !== null),
    };
  }

  async quote(groups: QuoteRequestGroup[]): Promise<QuoteGroup[]> {
    const result: QuoteGroup[] = [];

    for (const group of groups) {
      const [
        { data: merchant, error: merchantError },
        { data: zone, error: zoneError },
        { data: variants, error: variantsError },
      ] = await Promise.all([
        this.client
          .from("merchant_accounts")
          .select("id, public_name")
          .eq("id", group.merchantId)
          .eq("status", "active")
          .eq("verification_status", "approved")
          .in("subscription_status", ["active", "grace"])
          .maybeSingle(),
        this.client
          .from("delivery_zones")
          .select(
            "id, merchant_id, label, fee_xof, min_delay_minutes, max_delay_minutes",
          )
          .eq("id", group.deliveryZoneId)
          .eq("merchant_id", group.merchantId)
          .eq("active", true)
          .maybeSingle(),
        this.client
          .from("product_variants")
          .select(
            "id, merchant_id, sku, title, price_xof, active, products!inner(title, status), inventory_items!inner(available_quantity, reserved_quantity)",
          )
          .in(
            "id",
            group.items.map((item) => item.variantId),
          )
          .eq("merchant_id", group.merchantId)
          .eq("active", true)
          .eq("products.status", "published"),
      ]);

      if (merchantError) throw merchantError;
      if (zoneError) throw zoneError;
      if (variantsError) throw variantsError;
      if (!merchant) {
        throw new ApiError(
          409,
          "MERCHANT_NOT_ORDERABLE",
          "Cette boutique ne reçoit pas de commandes.",
        );
      }
      if (!zone) {
        throw new ApiError(
          409,
          "DELIVERY_ZONE_UNAVAILABLE",
          "Cette zone de livraison n’est plus disponible.",
        );
      }

      const rawVariants = (variants ?? []) as unknown as Array<{
        id: string;
        sku: string;
        title: string | null;
        price_xof: number;
        products: { title: string } | Array<{ title: string }>;
        inventory_items:
          | { available_quantity: number; reserved_quantity: number }
          | Array<{ available_quantity: number; reserved_quantity: number }>;
      }>;
      const variantMap = new Map(
        rawVariants.map((variant) => [variant.id, variant]),
      );

      const items = group.items.map((item) => {
        const variant = variantMap.get(item.variantId);
        if (!variant) {
          throw new ApiError(
            409,
            "VARIANT_UNAVAILABLE",
            "Un produit n’est plus disponible.",
          );
        }
        const inventory = firstInventory(variant.inventory_items);
        const available =
          (inventory?.available_quantity ?? 0) -
          (inventory?.reserved_quantity ?? 0);
        if (available < item.quantity) {
          throw new ApiError(
            409,
            "INSUFFICIENT_STOCK",
            "Le stock a changé.",
          );
        }
        const product = Array.isArray(variant.products)
          ? variant.products[0]
          : variant.products;
        return {
          variantId: variant.id,
          title: variant.title || product?.title || "Produit",
          sku: variant.sku,
          quantity: item.quantity,
          unitPriceXof: variant.price_xof,
          lineTotalXof: variant.price_xof * item.quantity,
        };
      });

      const subtotalXof = items.reduce(
        (total, item) => total + item.lineTotalXof,
        0,
      );
      result.push({
        merchantId: merchant.id,
        merchantName: merchant.public_name,
        deliveryZoneId: zone.id,
        deliveryLabel: zone.label,
        subtotalXof,
        deliveryFeeXof: zone.fee_xof,
        totalXof: subtotalXof + zone.fee_xof,
        minDelayMinutes: zone.min_delay_minutes,
        maxDelayMinutes: zone.max_delay_minutes,
        items,
      });
    }

    return result;
  }
}
