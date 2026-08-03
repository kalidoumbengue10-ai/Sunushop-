import { requireUser } from "@/lib/api/auth";
import { requireApprovedMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import {
  productInputSchema,
  productPublicationSchema,
} from "@/lib/domain/schemas";
import { createPublicSlug } from "@/lib/domain/public-slug";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId");
    const { supabase } = await requireUser();
    let query = supabase
      .from("products")
      .select(
        "id, merchant_id, category_id, title, slug, description, status, published_at, created_at, product_variants(id, sku, title, price_xof, compare_at_price_xof, active, inventory_items(available_quantity, reserved_quantity))",
      )
      .order("created_at", { ascending: false });
    if (merchantId) query = query.eq("merchant_id", merchantId);
    const { data, error } = await query;
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = productInputSchema.parse(await request.json());
    const { supabase } = await requireApprovedMerchantAccess(input.merchantId, ["owner", "manager", "catalog"]);
    const { data, error } = await supabase.rpc("create_merchant_product", {
      p_merchant_id: input.merchantId,
      p_category_id: input.categoryId,
      p_title: input.title,
      p_slug: input.slug ?? createPublicSlug(input.title),
      p_description: input.description,
      p_sku: input.sku,
      p_variant_title: input.variantTitle ?? "",
      p_price_xof: input.priceXof,
      p_compare_at_price_xof: input.compareAtPriceXof ?? null,
      p_stock: input.stock,
      p_publish: input.publish,
    });
    if (error) throw error;
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = productPublicationSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("merchant_id")
      .eq("id", input.productId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    await requireApprovedMerchantAccess(product.merchant_id, ["owner", "manager", "catalog"]);
    const { data, error } = await supabase.rpc(
      "set_merchant_product_publication",
      {
        p_product_id: input.productId,
        p_publish: input.publish,
      },
    );
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
