import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { requireReadableVerificationCase } from "@/lib/api/verification-case-access";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id: caseId, documentId } = await context.params;
    const { verificationCase } = await requireReadableVerificationCase(caseId);
    const admin = requireAdminClient();

    const { data: document, error } = await admin
      .from("verification_documents")
      .select("id, case_id, merchant_id, storage_bucket, storage_path, document_type, version")
      .eq("id", documentId)
      .single();
    if (error) throw error;
    if (
      document.case_id !== caseId ||
      document.merchant_id !== verificationCase.merchant_id
    ) {
      throw new ApiError(404, "NOT_FOUND", "Document introuvable.");
    }

    const { data: signed, error: signedError } = await admin.storage
      .from(document.storage_bucket)
      .createSignedUrl(document.storage_path, 300);
    if (signedError) throw signedError;

    return apiSuccess(
      {
        url: signed.signedUrl,
        documentType: document.document_type,
        version: document.version,
      },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
