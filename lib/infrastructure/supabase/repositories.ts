import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { highestCategoryDeliveryFee } from "@/lib/domain/delivery-pricing";
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
    attributes: Record<string, string>;
    active: boolean;
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
    attributes,
    active,
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
  const variants = product.product_variants
    .filter((variant) => variant.active)
    .map((variant) => {
      const inventory = firstInventory(variant.inventory_items);
      return {
        id: variant.id,
        sku: variant.sku,
        title: variant.title,
        attributes: variant.attributes ?? {},
        priceXof: variant.price_xof,
        compareAtPriceXof: variant.compare_at_price_xof,
        availableQuantity: Math.max(0, (inventory?.available_quantity ?? 0) - (inventory?.reserved_quantity ?? 0)),
      };
    });
  const variant = variants.find((item) => item.availableQuantity > 0) ?? variants[0];
  if (!variant) return null;
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
      attributes: variant.attributes,
      priceXof: variant.priceXof,
      compareAtPriceXof: variant.compareAtPriceXof,
      availableQuantity: variant.availableQuantity,
    },
    variants,
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
    const page = await this.listPage({ ...input, page: 1 });
    return page.products;
  }

  async listPage(input: {
    query?: string;
    category?: string;
    merchantSlug?: string;
    page: number;
    limit: number;
  }) {
    const page = Math.max(1, input.page);
    const limit = Math.min(60, Math.max(1, input.limit));
    const from = (page - 1) * limit;
    let request = this.client
      .from("products")
      .select(productSelection, { count: "exact" })
      .eq("status", "published")
      .eq("merchant_accounts.status", "active")
      .eq("merchant_accounts.verification_status", "approved")
      .in("merchant_accounts.subscription_status", ["active", "grace"])
      .order("published_at", { ascending: false })
      .range(from, from + limit - 1);

    if (input.query) request = request.ilike("title", `%${input.query}%`);
    if (input.category) {
      request = request.eq("categories.slug", input.category);
    }
    if (input.merchantSlug) request = request.eq("merchant_accounts.slug", input.merchantSlug);

    const { data, error, count } = await request;
    if (error) throw error;
    const mapped = ((data ?? []) as unknown as RawProduct[])
      .map((product) => mapProduct(this.client, product))
      .filter(
        (product): product is CatalogItem =>
          product !== null &&
          product.imageUrl !== null &&
          product.variant.availableQuantity > 0,
      );
    if (!mapped.length) return { products: [], total: count ?? 0, page, limit };
    const { data: zones, error: zonesError } = await this.client
      .from("delivery_zones")
      .select("merchant_id")
      .in("merchant_id", [...new Set(mapped.map((item) => item.merchant.id))])
      .eq("active", true);
    if (zonesError) throw zonesError;
    const orderable = new Set((zones ?? []).map((zone) => zone.merchant_id));
    return {
      products: mapped.filter((product) => orderable.has(product.merchant.id)),
      total: count ?? mapped.length,
      page,
      limit,
    };
  }

  async findByVariantIds(variantIds: string[]) {
    if (!variantIds.length) return [];
    const { data: variantRows, error: variantError } = await this.client
      .from("product_variants")
      .select("id, product_id")
      .in("id", variantIds);
    if (variantError) throw variantError;
    const productIds = [...new Set((variantRows ?? []).map((row) => row.product_id))];
    if (!productIds.length) return [];
    const { data, error } = await this.client
      .from("products")
      .select(productSelection)
      .in("id", productIds)
      .eq("status", "published")
      .eq("merchant_accounts.status", "active")
      .eq("merchant_accounts.verification_status", "approved")
      .in("merchant_accounts.subscription_status", ["active", "grace"]);
    if (error) throw error;
    const wanted = new Set(variantIds);
    return ((data ?? []) as unknown as RawProduct[]).flatMap((raw) => {
      const product = mapProduct(this.client, raw);
      if (!product) return [];
      const selected = product.variants.find((variant) => wanted.has(variant.id));
      return selected ? [{ ...product, variant: selected }] : [];
    });
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
    if (!zones?.length) return null;

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
        .filter(
          (product): product is CatalogItem =>
            product !== null &&
            product.imageUrl !== null &&
            product.variant.availableQuantity > 0,
        ),
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
            "id, merchant_id, label, fee_xof, min_delay_minutes, max_delay_minutes, delivery_category_rates(category_id, fee_xof)",
          )
          .eq("id", group.deliveryZoneId)
          .eq("merchant_id", group.merchantId)
          .eq("active", true)
          .maybeSingle(),
        this.client
          .from("product_variants")
          .select(
            "id, merchant_id, sku, title, price_xof, active, products!inner(title, status, category_id), inventory_items!inner(available_quantity, reserved_quantity)",
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
        products: { title: string; category_id: string } | Array<{ title: string; category_id: string }>;
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
      const categoryRates = (zone.delivery_category_rates ?? []) as Array<{ category_id: string; fee_xof: number }>;
      const deliveryFeeXof = highestCategoryDeliveryFee(
        zone.fee_xof,
        rawVariants.map((variant) => {
          const product = Array.isArray(variant.products) ? variant.products[0] : variant.products;
          return product?.category_id ?? "";
        }),
        categoryRates.map((rate) => ({ categoryId: rate.category_id, feeXof: rate.fee_xof })),
      );
      result.push({
        merchantId: merchant.id,
        merchantName: merchant.public_name,
        deliveryZoneId: zone.id,
        deliveryLabel: zone.label,
        subtotalXof,
        deliveryFeeXof,
        totalXof: subtotalXof + deliveryFeeXof,
        minDelayMinutes: zone.min_delay_minutes,
        maxDelayMinutes: zone.max_delay_minutes,
        items,
      });
    }

    return result;
  }
}
