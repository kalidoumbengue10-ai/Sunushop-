import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { requireEditableVerificationCase } from "@/lib/api/verification-case-access";
import { validateVerificationFile } from "@/lib/domain/document-file";
import { renderIntentLetterPdf } from "@/lib/domain/intent-letter-pdf";
import { intentLetterSubmissionSchema } from "@/lib/domain/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id: caseId } = await context.params;
    const input = intentLetterSubmissionSchema.parse(await request.json());
    const { user, verificationCase } = await requireEditableVerificationCase(caseId);
    const admin = requireAdminClient();

    const { data: merchant, error: merchantError } = await admin
      .from("merchant_accounts")
      .select("legal_name, public_name, phone, email, address_hint, ninea, rccm")
      .eq("id", verificationCase.merchant_id)
      .single();
    if (merchantError) throw merchantError;

    const certifiedAt = new Intl.DateTimeFormat("fr-SN", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Africa/Dakar",
    }).format(new Date());

    const pdfBytes = await renderIntentLetterPdf({
      signatoryName: input.signatoryName,
      signatoryBirthDate: input.signatoryBirthDate,
      idType: input.idType,
      idNumber: input.idNumber,
      signatoryRole: input.signatoryRole,
      actingFor: input.actingFor,
      legalName: merchant.legal_name,
      publicName: merchant.public_name,
      activityDescription: input.activityDescription,
      addressHint: merchant.address_hint ?? "",
      phone: merchant.phone,
      email: merchant.email ?? user.email ?? "",
      ninea: merchant.ninea,
      rccm: merchant.rccm ?? "",
      signaturePlace: input.signaturePlace,
      certifiedAt,
      certifiedByEmail: user.email ?? "",
    });

    const validated = await validateVerificationFile(
      new File([new Uint8Array(pdfBytes)], "lettre-intention.pdf", { type: "application/pdf" }),
    );

    const { data: latest, error: latestError } = await admin
      .from("verification_documents")
      .select("version")
      .eq("case_id", caseId)
      .eq("document_type", "intent_letter")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    const version = (latest?.version ?? 0) + 1;
    const documentId = crypto.randomUUID();
    const storagePath = `${user.id}/${verificationCase.merchant_id}/${caseId}/${documentId}-v${version}.${validated.extension}`;

    const { error: uploadError } = await admin.storage
      .from("merchant-verification")
      .upload(storagePath, validated.buffer, {
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
        document_type: "intent_letter",
        version,
        storage_bucket: "merchant-verification",
        storage_path: storagePath,
        sha256: validated.sha256,
        mime_type: validated.mime,
        size_bytes: validated.size,
        uploaded_by: user.id,
      });
    if (insertError) {
      await admin.storage.from("merchant-verification").remove([storagePath]);
      throw insertError;
    }

    if (version > 1) {
      await admin
        .from("verification_documents")
        .update({ status: "replaced" })
        .eq("case_id", caseId)
        .eq("document_type", "intent_letter")
        .lt("version", version)
        .neq("status", "purged");
    }

    await admin.from("verification_events").insert({
      case_id: caseId,
      merchant_id: verificationCase.merchant_id,
      actor_id: user.id,
      event_type: "document_uploaded",
      to_status: verificationCase.status,
      public_message: "Lettre d’intention complétée en ligne.",
      metadata: { documentType: "intent_letter", version },
    });

    return apiSuccess(
      {
        id: documentId,
        documentType: "intent_letter",
        version,
        mimeType: validated.mime,
        sizeBytes: validated.size,
      },
      { status: 201, requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
