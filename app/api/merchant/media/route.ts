import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { validateProductMediaFile } from "@/lib/domain/product-media-file";
import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let uploadedPath: string | undefined;
  try {
    const { user, supabase } = await requireUser();
    const form = await request.formData();
    const merchantId = String(form.get("merchantId") ?? "");
    const kind = String(form.get("kind") ?? "");
    if (kind !== "logo" && kind !== "cover") {
      throw new ApiError(400, "MEDIA_KIND_INVALID", "Type d’image invalide.");
    }
    await requireActiveMerchantAccess(merchantId, ["owner", "manager", "catalog"]);
    const { data: membership } = await supabase
      .from("merchant_members")
      .select("role")
      .eq("merchant_id", merchantId)
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["owner", "manager", "catalog"])
      .maybeSingle();
    if (!membership) throw new ApiError(403, "FORBIDDEN", "Accès refusé.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", "Sélectionnez une image.");
    const valid = await validateProductMediaFile(file);
    const admin = requireAdminClient();
    const { data: previous } = await admin
      .from("merchant_media")
      .select("storage_path")
      .eq("merchant_id", merchantId)
      .eq("kind", kind)
      .maybeSingle();
    uploadedPath = `${merchantId}/${kind}/${crypto.randomUUID()}.${valid.extension}`;
    const { error: uploadError } = await admin.storage
      .from("merchant-branding")
      .upload(uploadedPath, valid.buffer, { contentType: valid.mime, cacheControl: "31536000", upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await admin
      .from("merchant_media")
      .upsert({
        merchant_id: merchantId,
        kind,
        storage_bucket: "merchant-branding",
        storage_path: uploadedPath,
        mime_type: valid.mime,
        size_bytes: file.size,
        uploaded_by: user.id,
      }, { onConflict: "merchant_id,kind" })
      .select("id, kind, storage_path")
      .single();
    if (error) throw error;
    if (previous?.storage_path) await admin.storage.from("merchant-branding").remove([previous.storage_path]);
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: merchantId,
      action: "merchant.media.upload",
      entity_type: "merchant_account",
      entity_id: merchantId,
      request_id: requestId,
      metadata: { kind },
    });
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    if (uploadedPath) await requireAdminClient().storage.from("merchant-branding").remove([uploadedPath]);
    return apiFailure(error, requestId);
  }
}
