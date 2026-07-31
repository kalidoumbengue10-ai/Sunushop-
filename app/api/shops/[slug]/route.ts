import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { slug } = await context.params;
    const repository = new SupabaseCatalogRepository(requireAdminClient());
    const shop = await repository.findShopBySlug(slug);
    if (!shop) {
      throw new ApiError(404, "SHOP_NOT_FOUND", "Boutique introuvable.");
    }
    return apiSuccess(shop, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
