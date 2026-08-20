import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { requireEditableCourierVerificationCase } from "@/lib/api/courier-verification-case-access";
import { validateVerificationFile } from "@/lib/domain/document-file";
import { courierDocumentFinalizeSchema } from "@/lib/domain/schemas";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  let cleanupPath: string | null = null;

  try {
    const { id: caseId } = await context.params;
    const input = courierDocumentFinalizeSchema.parse(await request.json());
    const { user, verificationCase } = await requireEditableCourierVerificationCase(caseId);
    const admin = requireAdminClient();
    const expectedPrefix = [user.id, "pending", verificationCase.courier_id, caseId, ""].join("/");

    if (!input.storagePath.startsWith(expectedPrefix)) {
      throw new ApiError(403, "INVALID_UPLOAD_PATH", "Cet envoi ne correspond pas à votre dossier.");
    }
    cleanupPath = input.storagePath;

    const { data: storedFile, error: downloadError } = await admin.storage
      .from("courier-verification")
      .download(input.storagePath);
    if (downloadError) throw downloadError;
    const validated = await validateVerificationFile(
      new File([storedFile], "document", { type: storedFile.type || "application/octet-stream" }),
    );

    const { data: latest, error: latestError } = await admin
      .from("courier_verification_documents")
      .select("version")
      .eq("case_id", caseId)
      .eq("document_type", input.documentType)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    const version = (latest?.version ?? 0) + 1;
    const documentId = crypto.randomUUID();
    const finalPath = `${user.id}/${verificationCase.courier_id}/${caseId}/${documentId}-v${version}.${validated.extension}`;
    const { error: moveError } = await admin.storage
      .from("courier-verification")
      .move(input.storagePath, finalPath);
    if (moveError) throw moveError;
    cleanupPath = finalPath;

    const { error: insertError } = await admin.from("courier_verification_documents").insert({
      id: documentId,
      case_id: caseId,
      courier_id: verificationCase.courier_id,
      document_type: input.documentType,
      version,
      storage_bucket: "courier-verification",
      storage_path: finalPath,
      sha256: validated.sha256,
      mime_type: validated.mime,
      size_bytes: validated.size,
      uploaded_by: user.id,
    });
    if (insertError) throw insertError;
    cleanupPath = null;

    if (version > 1) {
      await admin
        .from("courier_verification_documents")
        .update({ status: "replaced" })
        .eq("case_id", caseId)
        .eq("document_type", input.documentType)
        .lt("version", version)
        .neq("status", "purged");
    }

    await admin.from("courier_verification_events").insert({
      case_id: caseId,
      courier_id: verificationCase.courier_id,
      actor_id: user.id,
      event_type: "document_uploaded",
      public_message: "Un document a été ajouté au dossier.",
      metadata: { documentType: input.documentType, version },
    });

    return apiSuccess(
      { id: documentId, documentType: input.documentType, version, mimeType: validated.mime, sizeBytes: validated.size },
      { status: 201, requestId },
    );
  } catch (error) {
    if (cleanupPath) {
      const admin = requireAdminClient();
      await admin.storage.from("courier-verification").remove([cleanupPath]);
    }
    return apiFailure(error, requestId);
  }
}
