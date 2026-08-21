import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import {
  productInputSchema,
  productDraftSchema,
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
    const body = await request.json();
    const draftOnly = body.draftOnly === true;
    const input = draftOnly ? productDraftSchema.parse(body) : productInputSchema.parse(body);
    const { supabase } = await requireActiveMerchantAccess(input.merchantId, ["owner", "manager", "catalog"]);
    const automaticSku = `AUTO-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const { data, error } = await supabase.rpc("create_merchant_product", {
      p_merchant_id: input.merchantId,
      p_category_id: input.categoryId,
      p_title: input.title,
      p_slug: "slug" in input && input.slug ? input.slug : createPublicSlug(input.title),
      p_description: input.description,
      p_sku: "sku" in input ? input.sku ?? automaticSku : automaticSku,
      p_variant_title: "variantTitle" in input ? input.variantTitle ?? "" : "Standard",
      p_price_xof: "priceXof" in input ? input.priceXof : 0,
      p_compare_at_price_xof: "compareAtPriceXof" in input ? input.compareAtPriceXof ?? null : null,
      p_stock: "stock" in input ? input.stock : 0,
      p_publish: "publish" in input ? input.publish : false,
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
    const { admin, user } = await requireActiveMerchantAccess(product.merchant_id, ["owner", "manager", "catalog"]);
    if ("action" in input) {
      if (input.action === "restore") {
        const [{ count }, { data: subscription }] = await Promise.all([
          admin.from("products").select("id", { count: "exact", head: true }).eq("merchant_id", product.merchant_id).neq("status", "archived"),
          admin.from("merchant_subscriptions").select("plan_id").eq("merchant_id", product.merchant_id).in("status", ["active", "grace"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        const { data: plan } = subscription
          ? await admin.from("subscription_plans").select("product_limit").eq("id", subscription.plan_id).maybeSingle()
          : { data: null };
        const productLimit = plan?.product_limit ?? 20;
        if ((count ?? 0) >= productLimit) {
          throw new ApiError(409, "PRODUCT_LIMIT_REACHED", "La limite de produits de votre abonnement est atteinte.");
        }
      }
      const nextStatus = input.action === "archive" ? "archived" : "draft";
      const { data, error } = await admin
        .from("products")
        .update({ status: nextStatus, published_at: null })
        .eq("id", input.productId)
        .neq("status", "suspended")
        .select("id, status")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError(409, "PRODUCT_SUSPENDED", "Ce produit est suspendu et ne peut pas être modifié.");
      await admin.from("audit_events").insert({
        actor_id: user.id,
        merchant_id: product.merchant_id,
        action: input.action === "archive" ? "product.archive" : "product.restore",
        entity_type: "product",
        entity_id: input.productId,
        request_id: requestId,
      });
      return apiSuccess(data, { requestId });
    }
    if (input.publish) {
      const { data: merchantState } = await supabase.from("merchant_accounts").select("subscription_status").eq("id", product.merchant_id).maybeSingle();
      if (!merchantState || !["active", "grace"].includes(merchantState.subscription_status)) {
        throw new ApiError(402, "SUBSCRIPTION_REQUIRED", "Activez votre abonnement marchand avant de publier un produit.");
      }
      const [{ count: variantCount }, { count: mediaCount }, { count: deliveryCount }] = await Promise.all([
        supabase.from("product_variants").select("id", { count: "exact", head: true }).eq("product_id", input.productId).eq("active", true),
        supabase.from("product_media").select("id", { count: "exact", head: true }).eq("product_id", input.productId),
        supabase.from("delivery_zones").select("id", { count: "exact", head: true }).eq("merchant_id", product.merchant_id).eq("active", true),
      ]);
      if (!variantCount) throw new ApiError(409, "PRODUCT_VARIANT_REQUIRED", "Ajoutez au moins une variante active.");
      if (!mediaCount) throw new ApiError(409, "PRODUCT_MEDIA_REQUIRED", "Ajoutez au moins une photo avant de publier.");
      if (!deliveryCount) throw new ApiError(409, "DELIVERY_REQUIRED", "Configurez au moins une région de livraison ou un retrait.");
    }
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
