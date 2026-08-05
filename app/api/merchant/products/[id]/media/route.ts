import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { validateProductMediaFile } from "@/lib/domain/product-media-file";
import { requireApprovedMerchantAccess } from "@/lib/api/merchant-access";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  let uploadedPath: string | undefined;
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const { data: product } = await supabase
      .from("products")
      .select("id, merchant_id")
      .eq("id", id)
      .maybeSingle();
    if (!product) {
      throw new ApiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
    }
    await requireApprovedMerchantAccess(product.merchant_id, ["owner", "manager", "catalog"]);

    const { count } = await supabase
      .from("product_media")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id);
    if ((count ?? 0) >= 8) {
      throw new ApiError(409, "PRODUCT_MEDIA_LIMIT", "Vous pouvez ajouter jusqu’à 8 photos par produit.");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "FILE_REQUIRED", "Sélectionnez une image.");
    }
    const altText = String(form.get("altText") ?? "").trim().slice(0, 180);
    const validFile = await validateProductMediaFile(file);
    const admin = requireAdminClient();
    uploadedPath = `${product.merchant_id}/${id}/${crypto.randomUUID()}.${validFile.extension}`;

    const { error: uploadError } = await admin.storage
      .from("product-media")
      .upload(uploadedPath, validFile.buffer, {
        contentType: validFile.mime,
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: media, error: insertError } = await admin
      .from("product_media")
      .insert({
        product_id: id,
        merchant_id: product.merchant_id,
        storage_bucket: "product-media",
        storage_path: uploadedPath,
        alt_text: altText || null,
        position: count ?? 0,
      })
      .select("id, storage_path, alt_text, position")
      .single();
    if (insertError) throw insertError;

    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: product.merchant_id,
      action: "product.media.upload",
      entity_type: "product",
      entity_id: id,
      request_id: requestId,
    });

    return apiSuccess(media, { status: 201, requestId });
  } catch (error) {
    if (uploadedPath) {
      const admin = requireAdminClient();
      await admin.storage.from("product-media").remove([uploadedPath]);
    }
    return apiFailure(error, requestId);
  }
}
