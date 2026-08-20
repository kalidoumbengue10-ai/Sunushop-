import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    await requireAdminRole(["reviewer", "admin"]);
    const admin = requireAdminClient();

    const { data: verificationCase, error } = await admin
      .from("courier_verification_cases")
      .select(
        "id, courier_id, status, submission_version, submitted_at, decided_at, decision_code, courier_message, internal_note, courier_profiles!inner(display_name, phone, email, vehicle_type, vehicle_registration, verification_status)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!verificationCase) {
      throw new ApiError(404, "COURIER_VERIFICATION_CASE_NOT_FOUND", "Dossier livreur introuvable.");
    }

    const { data: documents, error: documentsError } = await admin
      .from("courier_verification_documents")
      .select("id, document_type, version, mime_type, size_bytes, status, uploaded_at, storage_path")
      .eq("case_id", id)
      .neq("status", "purged")
      .order("version", { ascending: false });
    if (documentsError) throw documentsError;

    // URLs signées de courte durée : les pièces d'identité ne transitent jamais
    // par un lien public.
    const items = await Promise.all(
      (documents ?? []).map(async (document) => ({
        id: document.id,
        documentType: document.document_type,
        version: document.version,
        mimeType: document.mime_type,
        sizeBytes: document.size_bytes,
        status: document.status,
        uploadedAt: document.uploaded_at,
        url: document.storage_path
          ? (await admin.storage.from("courier-verification").createSignedUrl(document.storage_path, 600)).data?.signedUrl ?? null
          : null,
      })),
    );

    return apiSuccess({ case: verificationCase, documents: items }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
