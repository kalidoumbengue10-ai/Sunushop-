import { requireAdminRole } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { crmLeadUpdateSchema } from "@/lib/domain/schemas";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireAdminRole(["support", "admin"]);
    const { data, error } = await supabase
      .from("crm_leads")
      .select("id, source, full_name, business_name, email, phone, city, business_type, sales_channel, message, status, priority, owner_user_id, merchant_id, last_contacted_at, next_follow_up_at, converted_at, created_at, updated_at, crm_lead_notes(id, body, author_id, created_at), crm_lead_events(id, event_type, from_status, to_status, summary, created_at)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "CRM_LEAD_NOT_FOUND", "Prospect introuvable.");

    let merchant: { status: string; verification_status: string; subscription_status: string } | null = null;
    let documents: Array<{ id: string; case_id: string; document_type: string; status: string; version: number; mime_type: string; uploaded_at: string }> = [];
    let caseId: string | null = null;
    if (data.merchant_id) {
      const [{ data: merchantRow }, { data: documentRows }, { data: caseRow }] = await Promise.all([
        supabase
          .from("merchant_accounts")
          .select("status, verification_status, subscription_status")
          .eq("id", data.merchant_id)
          .maybeSingle(),
        supabase
          .from("verification_documents")
          .select("id, case_id, document_type, status, version, mime_type, uploaded_at")
          .eq("merchant_id", data.merchant_id)
          .order("version", { ascending: false }),
        supabase
          .from("verification_cases")
          .select("id")
          .eq("merchant_id", data.merchant_id)
          .order("submission_version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      merchant = merchantRow ?? null;
      documents = documentRows ?? [];
      caseId = caseRow?.id ?? null;
    }

    return apiSuccess({ ...data, merchant, documents, caseId }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = crmLeadUpdateSchema.parse(await request.json());
    if (input.status === "converted") {
      throw new ApiError(409, "CRM_SUBSCRIPTION_REQUIRED", "Le passage en client est automatique après activation de l’abonnement.");
    }
    const { user, supabase } = await requireAdminRole(["support", "admin"]);
    const { data: current, error: currentError } = await supabase
      .from("crm_leads")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new ApiError(404, "CRM_LEAD_NOT_FOUND", "Prospect introuvable.");
    if (current.status === "converted") {
      throw new ApiError(409, "CRM_CLIENT_IMMUTABLE", "Ce contact est désormais géré depuis les clients commerçants.");
    }

    const values: Record<string, unknown> = {};
    if (input.status) {
      values.status = input.status;
      if (input.status === "contacted") values.last_contacted_at = new Date().toISOString();
    }
    if (input.priority) values.priority = input.priority;

    const { data, error } = await supabase
      .from("crm_leads")
      .update(values)
      .eq("id", id)
      .select("id, status, priority, updated_at")
      .single();
    if (error) throw error;
    const { error: eventError } = await supabase.from("crm_lead_events").insert({
      lead_id: id,
      actor_id: user.id,
      event_type: input.status && input.status !== current.status ? "status_changed" : "lead_updated",
      from_status: current.status,
      to_status: data.status,
      summary: input.status && input.status !== current.status
        ? "Étape de suivi mise à jour."
        : "Informations de suivi mises à jour.",
    });
    if (eventError) throw eventError;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireAdminRole(["admin"]);
    const { data: lead, error: leadError } = await supabase
      .from("crm_leads")
      .select("id, business_name, merchant_id")
      .eq("id", id)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!lead) throw new ApiError(404, "CRM_LEAD_NOT_FOUND", "Prospect introuvable.");
    if (lead.merchant_id) {
      throw new ApiError(
        409,
        "CRM_LEAD_LINKED_TO_MERCHANT",
        "Ce prospect a une boutique associée. Suspendez la boutique plutôt que de supprimer la fiche.",
      );
    }

    await supabase.from("audit_events").insert({
      actor_id: user.id,
      action: "crm.lead.delete",
      entity_type: "crm_lead",
      entity_id: id,
      request_id: requestId,
      metadata: { business_name: lead.business_name },
    });

    const { error: deleteError } = await supabase.from("crm_leads").delete().eq("id", id);
    if (deleteError) throw deleteError;
    return apiSuccess({ id }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
