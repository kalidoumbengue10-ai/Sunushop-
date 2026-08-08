import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { productDetailsSchema } from "@/lib/domain/schemas";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = productDetailsSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("merchant_id")
      .eq("id", id)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
    const access = await requireActiveMerchantAccess(product.merchant_id, ["owner", "manager", "catalog"]);
    const { data, error } = await access.supabase.rpc("save_merchant_product_variants", {
      p_product_id: id,
      p_category_id: input.categoryId,
      p_title: input.title,
      p_description: input.description,
      p_variants: input.variants,
      p_option_names: input.optionNames,
    });
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
