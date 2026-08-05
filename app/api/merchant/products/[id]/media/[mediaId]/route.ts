import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireApprovedMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";

async function requireMedia(productId: string, mediaId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("product_media")
    .select("id, product_id, merchant_id, storage_bucket, storage_path")
    .eq("id", mediaId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "PRODUCT_MEDIA_NOT_FOUND", "Photo introuvable.");
  await requireApprovedMerchantAccess(data.merchant_id, ["owner", "manager", "catalog"]);
  return data;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id, mediaId } = await context.params;
    const media = await requireMedia(id, mediaId);
    const body = await request.json();
    const position = Math.max(0, Math.min(7, Number(body.position ?? 0)));
    const altText = String(body.altText ?? "").trim().slice(0, 180) || null;
    const admin = requireAdminClient();
    const { data, error } = await admin.from("product_media")
      .update({ position, alt_text: altText })
      .eq("id", media.id)
      .select("id, position, alt_text")
      .single();
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id, mediaId } = await context.params;
    const media = await requireMedia(id, mediaId);
    const admin = requireAdminClient();
    const { error } = await admin.from("product_media").delete().eq("id", media.id);
    if (error) throw error;
    await admin.storage.from(media.storage_bucket).remove([media.storage_path]);
    return apiSuccess({ deleted: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
