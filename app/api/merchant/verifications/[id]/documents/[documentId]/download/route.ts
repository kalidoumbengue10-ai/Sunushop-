import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { requireReadableVerificationCase } from "@/lib/api/verification-case-access";
import { pilotConfig } from "@/lib/config/env";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id: caseId, documentId } = await context.params;
    const { user, verificationCase } = await requireReadableVerificationCase(caseId);
    const admin = requireAdminClient();

    const { data: document, error } = await admin
      .from("verification_documents")
      .select("id, case_id, merchant_id, storage_bucket, storage_path, document_type, version, status")
      .eq("id", documentId)
      .single();
    if (error) throw error;
    if (
      document.case_id !== caseId ||
      document.merchant_id !== verificationCase.merchant_id
    ) {
      throw new ApiError(404, "NOT_FOUND", "Document introuvable.");
    }
    if (!document.storage_path || document.status === "purged") {
      throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document indisponible.");
    }

    const filename = document.document_type === "intent_letter"
      ? `Lettre-intention-SunuShop-v${document.version}.pdf`
      : `Document-SunuShop-v${document.version}`;
    const [viewResult, downloadResult] = await Promise.all([
      admin.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, pilotConfig.kycSignedUrlTtlSeconds),
      admin.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, pilotConfig.kycSignedUrlTtlSeconds, { download: filename }),
    ]);
    if (viewResult.error) throw viewResult.error;
    if (downloadResult.error) throw downloadResult.error;

    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: document.merchant_id,
      action: "verification_document.access",
      entity_type: "verification_document",
      entity_id: document.id,
      request_id: requestId,
    });

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
