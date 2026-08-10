import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function requireCourierManager(merchantId: string, membershipId: string) {
  const { user, supabase } = await requireUser();
  const { data: member } = await supabase
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", merchantId)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "manager", "fulfillment"])
    .maybeSingle();
  if (!member) throw new ApiError(403, "FORBIDDEN", "Accès refusé.");
  const admin = requireAdminClient();
  const { data: courier, error } = await admin
    .from("courier_memberships")
    .select("id, photo_storage_path")
    .eq("id", membershipId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw error;
  if (!courier) throw new ApiError(404, "COURIER_NOT_FOUND", "Livreur introuvable.");
  return { admin, user, courier };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const form = await request.formData();
    const merchantId = String(form.get("merchantId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File) || !acceptedTypes.has(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      throw new ApiError(422, "COURIER_PHOTO_INVALID", "Utilisez une image JPEG, PNG ou WebP de moins de 5 Mo.");
    }
    const { admin, user, courier } = await requireCourierManager(merchantId, id);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${merchantId}/${id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("courier-profiles").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { error: updateError } = await admin
      .from("courier_memberships")
      .update({ photo_storage_path: path })
      .eq("id", id)
      .eq("merchant_id", merchantId);
    if (updateError) {
      await admin.storage.from("courier-profiles").remove([path]);
      throw updateError;
    }
    if (courier.photo_storage_path) {
      await admin.storage.from("courier-profiles").remove([courier.photo_storage_path]);
    }
    const { data: signed } = await admin.storage.from("courier-profiles").createSignedUrl(path, 3600);
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: merchantId,
      action: "courier.photo.update",
      entity_type: "courier_membership",
      entity_id: id,
      request_id: requestId,
    });
    return apiSuccess({ photoUrl: signed?.signedUrl ?? null }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    const { admin, user, courier } = await requireCourierManager(merchantId, id);
    if (courier.photo_storage_path) {
      const { error: removeError } = await admin.storage.from("courier-profiles").remove([courier.photo_storage_path]);
      if (removeError) throw removeError;
    }
    const { error } = await admin.from("courier_memberships").update({ photo_storage_path: null }).eq("id", id);
    if (error) throw error;
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: merchantId,
      action: "courier.photo.delete",
      entity_type: "courier_membership",
      entity_id: id,
      request_id: requestId,
    });
    return apiSuccess({ id }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
