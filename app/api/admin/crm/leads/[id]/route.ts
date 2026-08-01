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
      .select("id, source, full_name, business_name, email, phone, city, business_type, sales_channel, message, status, priority, owner_user_id, merchant_id, last_contacted_at, next_follow_up_at, converted_at, created_at, updated_at, crm_lead_notes(id, body, author_id, created_at), crm_tasks(id, title, assigned_to, due_at, completed_at, created_at), crm_lead_events(id, event_type, from_status, to_status, summary, created_at)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "CRM_LEAD_NOT_FOUND", "Prospect introuvable.");
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = crmLeadUpdateSchema.parse(await request.json());
    const { user, supabase } = await requireAdminRole(["support", "admin"]);
    const { data: current, error: currentError } = await supabase
      .from("crm_leads")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new ApiError(404, "CRM_LEAD_NOT_FOUND", "Prospect introuvable.");

    const values: Record<string, unknown> = {};
    if (input.status) {
      values.status = input.status;
      if (input.status === "contacted") values.last_contacted_at = new Date().toISOString();
      if (input.status === "converted") values.converted_at = new Date().toISOString();
      if (current.status === "converted" && input.status !== "converted") values.converted_at = null;
    }
    if (input.priority) values.priority = input.priority;
    if (input.nextFollowUpAt !== undefined) values.next_follow_up_at = input.nextFollowUpAt;

    const { data, error } = await supabase
      .from("crm_leads")
      .update(values)
      .eq("id", id)
      .select("id, status, priority, next_follow_up_at, updated_at")
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
