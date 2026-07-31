import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { pilotConfig } from "@/lib/config/env";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id, documentId } = await context.params;
    const { user, supabase } = await requireAdminRole(["reviewer", "admin"]);
    const { data: visibleCase } = await supabase
      .from("verification_cases")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!visibleCase) {
      throw new ApiError(404, "VERIFICATION_NOT_FOUND", "Dossier introuvable.");
    }
    const admin = requireAdminClient();
    const { data: document, error } = await admin
      .from("verification_documents")
      .select("id, case_id, merchant_id, storage_bucket, storage_path, status")
      .eq("id", documentId)
      .eq("case_id", id)
      .single();
    if (error) throw error;
    if (!document.storage_path || document.status === "purged") {
      throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document indisponible.");
    }

    const { data: signed, error: signedError } = await admin.storage
      .from(document.storage_bucket)
      .createSignedUrl(
        document.storage_path,
        pilotConfig.kycSignedUrlTtlSeconds,
        { download: true },
      );
    if (signedError) throw signedError;

    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: document.merchant_id,
      action: "verification_document.view",
      entity_type: "verification_document",
      entity_id: document.id,
      request_id: requestId,
    });

    return apiSuccess(
      {
        url: signed.signedUrl,
        expiresIn: pilotConfig.kycSignedUrlTtlSeconds,
      },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
