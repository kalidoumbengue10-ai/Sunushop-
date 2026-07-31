import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const { data: visibleCase } = await supabase
      .from("verification_cases")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!visibleCase) {
      throw new ApiError(404, "VERIFICATION_NOT_FOUND", "Dossier introuvable.");
    }
    const admin = requireAdminClient();
    const [
      { data: verificationCase, error: caseError },
      { data: documents, error: documentsError },
      { data: events, error: eventsError },
    ] = await Promise.all([
      admin
        .from("verification_cases")
        .select(
          "id, merchant_id, submission_version, status, submitted_at, decided_at, decision_code, merchant_note, created_at, updated_at, merchant_accounts!inner(kind, public_name, representative_is_legal_owner)",
        )
        .eq("id", id)
        .single(),
      admin
        .from("verification_documents")
        .select(
          "id, document_type, version, mime_type, size_bytes, status, expires_on, uploaded_at",
        )
        .eq("case_id", id)
        .order("uploaded_at", { ascending: false }),
      admin
        .from("verification_events")
        .select(
          "id, event_type, from_status, to_status, public_message, created_at",
        )
        .eq("case_id", id)
        .order("created_at", { ascending: true }),
    ]);

    if (caseError) throw caseError;
    if (documentsError) throw documentsError;
    if (eventsError) throw eventsError;

    return apiSuccess(
      { case: verificationCase, documents, events },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
