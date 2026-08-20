import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { requireReadableCourierVerificationCase } from "@/lib/api/courier-verification-case-access";
import { pilotConfig } from "@/lib/config/env";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id: caseId, documentId } = await context.params;
    const { verificationCase } = await requireReadableCourierVerificationCase(caseId);
    const admin = requireAdminClient();

    const { data: document, error } = await admin
      .from("courier_verification_documents")
      .select("id, case_id, courier_id, storage_bucket, storage_path, document_type, version, status")
      .eq("id", documentId)
      .single();
    if (error) throw error;
    if (document.case_id !== caseId || document.courier_id !== verificationCase.courier_id) {
      throw new ApiError(404, "NOT_FOUND", "Document introuvable.");
    }
    if (!document.storage_path || document.status === "purged") {
      throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document indisponible.");
    }

    const filename = `Document-livreur-SunuShop-v${document.version}`;
    const [viewResult, downloadResult] = await Promise.all([
      admin.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, pilotConfig.kycSignedUrlTtlSeconds),
      admin.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, pilotConfig.kycSignedUrlTtlSeconds, { download: filename }),
    ]);
    if (viewResult.error) throw viewResult.error;
    if (downloadResult.error) throw downloadResult.error;

    return apiSuccess(
      {
        url: downloadResult.data.signedUrl,
        viewUrl: viewResult.data.signedUrl,
        downloadUrl: downloadResult.data.signedUrl,
        documentType: document.document_type,
        version: document.version,
        expiresIn: pilotConfig.kycSignedUrlTtlSeconds,
      },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
