import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { requireReadableCourierVerificationCase } from "@/lib/api/courier-verification-case-access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id: caseId } = await context.params;
    await requireReadableCourierVerificationCase(caseId);
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("courier_verification_documents")
      .select("id, document_type, version, mime_type, size_bytes, status, uploaded_at")
      .eq("case_id", caseId)
      .neq("status", "purged")
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
