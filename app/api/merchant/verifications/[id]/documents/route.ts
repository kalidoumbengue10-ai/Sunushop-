import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { validateVerificationFile } from "@/lib/domain/document-file";
import { verificationDocumentTypeSchema } from "@/lib/domain/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  let uploadedPath: string | null = null;

  try {
    const { id: caseId } = await context.params;
    const { user, supabase } = await requireUser();
    const admin = requireAdminClient();
    const form = await request.formData();
    const documentType = verificationDocumentTypeSchema.parse(
      form.get("documentType"),
    );
    const file = form.get("file");
    const expiresOnValue = form.get("expiresOn");
    const expiresOn =
      typeof expiresOnValue === "string" && expiresOnValue
        ? expiresOnValue
        : null;

    if (!(file instanceof File)) {
      throw new ApiError(400, "FILE_REQUIRED", "Sélectionnez un document.");
    }
    if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
      throw new ApiError(400, "INVALID_EXPIRY_DATE", "Date d’expiration invalide.");
    }

    const { data: verificationCase, error: caseError } = await supabase
      .from("verification_cases")
      .select("id, merchant_id, status")
      .eq("id", caseId)
      .single();
    if (caseError) throw caseError;
    if (!["draft", "needs_changes"].includes(verificationCase.status)) {
      throw new ApiError(
        409,
        "VERIFICATION_CASE_LOCKED",
        "Le dossier ne peut plus être modifié.",
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("merchant_members")
      .select("role")
      .eq("merchant_id", verificationCase.merchant_id)
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["owner", "manager"])
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) {
      throw new ApiError(403, "FORBIDDEN", "Accès marchand requis.");
    }

    const validated = await validateVerificationFile(file);
    const { data: latest } = await admin
      .from("verification_documents")
      .select("version")
      .eq("case_id", caseId)
      .eq("document_type", documentType)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (latest?.version ?? 0) + 1;
    const documentId = crypto.randomUUID();
    uploadedPath = `${user.id}/${verificationCase.merchant_id}/${caseId}/${documentId}-v${version}.${validated.extension}`;

    const { error: uploadError } = await admin.storage
      .from("merchant-verification")
      .upload(uploadedPath, validated.buffer, {
        contentType: validated.mime,
        cacheControl: "0",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: insertError } = await admin
      .from("verification_documents")
      .insert({
        id: documentId,
        case_id: caseId,
        merchant_id: verificationCase.merchant_id,
        document_type: documentType,
        version,
        storage_bucket: "merchant-verification",
        storage_path: uploadedPath,
        sha256: validated.sha256,
        mime_type: validated.mime,
        size_bytes: validated.size,
        expires_on: expiresOn,
        uploaded_by: user.id,
      });
    if (insertError) throw insertError;

    if (version > 1) {
      await admin
        .from("verification_documents")
        .update({ status: "replaced" })
        .eq("case_id", caseId)
        .eq("document_type", documentType)
        .lt("version", version)
        .neq("status", "purged");
    }

    await admin.from("verification_events").insert({
      case_id: caseId,
      merchant_id: verificationCase.merchant_id,
      actor_id: user.id,
      event_type: "document_uploaded",
      to_status: verificationCase.status,
      public_message: "Un document a été ajouté au dossier.",
      metadata: { documentType, version },
    });

    return apiSuccess(
      {
        id: documentId,
        documentType,
        version,
        mimeType: validated.mime,
        sizeBytes: validated.size,
      },
      { status: 201, requestId },
    );
  } catch (error) {
    if (uploadedPath) {
      const admin = requireAdminClient();
      await admin.storage
        .from("merchant-verification")
        .remove([uploadedPath]);
    }
    return apiFailure(error, requestId);
  }
}
