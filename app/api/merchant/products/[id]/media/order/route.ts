import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { productMediaOrderSchema } from "@/lib/domain/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id: productId } = await context.params;
    const input = productMediaOrderSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("merchant_id")
      .eq("id", productId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
    await requireActiveMerchantAccess(product.merchant_id, ["owner", "manager", "catalog"]);

    const { data, error } = await supabase.rpc("reorder_merchant_product_media", {
      p_product_id: productId,
      p_media_ids: input.mediaIds,
    });
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
