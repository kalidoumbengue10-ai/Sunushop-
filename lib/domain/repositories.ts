export type CatalogItem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: { id: string; name: string; slug: string };
  merchant: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
  };
  variant: {
    id: string;
    sku: string;
    title: string | null;
    attributes: Record<string, string>;
    priceXof: number;
    compareAtPriceXof: number | null;
    availableQuantity: number;
  };
  variants: Array<{
    id: string;
    sku: string;
    title: string | null;
    attributes: Record<string, string>;
    priceXof: number;
    compareAtPriceXof: number | null;
    availableQuantity: number;
  }>;
  imageUrl: string | null;
};

export type PublicShop = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  region: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  paymentMethods: {
    cashOnDelivery: boolean;
    wave: boolean;
    orangeMoney: boolean;
  };
  deliveryZones: Array<{
    id: string;
    label: string;
    region: string;
    city: string | null;
    feeXof: number;
    minDelayMinutes: number;
    maxDelayMinutes: number;
  }>;
  pickup: {
    enabled: boolean;
    addressLine: string | null;
    latitude: number | null;
    longitude: number | null;
    hours: string | null;
    instructions: string | null;
  };
  products: CatalogItem[];
};

export type QuoteRequestGroup = {
  merchantId: string;
  deliveryZoneId?: string | null;
  methodKind?: "pickup" | "merchant_delivery";
  items: Array<{ variantId: string; quantity: number }>;
};

export type QuoteGroup = {
  merchantId: string;
  merchantName: string;
  deliveryZoneId: string | null;
  deliveryLabel: string;
  methodKind: "pickup" | "merchant_delivery";
  subtotalXof: number;
  deliveryFeeXof: number;
  totalXof: number;
  minDelayMinutes: number;
  maxDelayMinutes: number;
  items: Array<{
    variantId: string;
    title: string;
    sku: string;
    quantity: number;
    unitPriceXof: number;
    lineTotalXof: number;
  }>;
};

export interface CatalogRepository {
  list(input: {
    query?: string;
    category?: string;
    limit: number;
  }): Promise<CatalogItem[]>;
  listPage(input: {
    query?: string;
    category?: string;
    merchantSlug?: string;
    page: number;
    limit: number;
  }): Promise<{ products: CatalogItem[]; total: number; page: number; limit: number }>;
  findByVariantIds(variantIds: string[]): Promise<CatalogItem[]>;
  findShopBySlug(slug: string): Promise<PublicShop | null>;
  quote(groups: QuoteRequestGroup[]): Promise<QuoteGroup[]>;
}
