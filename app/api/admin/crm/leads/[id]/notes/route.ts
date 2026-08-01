import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { crmLeadNoteSchema } from "@/lib/domain/schemas";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = crmLeadNoteSchema.parse(await request.json());
    const { user, supabase } = await requireAdminRole(["support", "admin"]);
    const { data, error } = await supabase
      .from("crm_lead_notes")
      .insert({ lead_id: id, author_id: user.id, body: input.body })
      .select("id, body, author_id, created_at")
      .single();
    if (error) throw error;
    const { error: eventError } = await supabase.from("crm_lead_events").insert({
      lead_id: id,
      actor_id: user.id,
      event_type: "note_added",
      summary: "Une note de suivi a été ajoutée.",
    });
    if (eventError) throw eventError;
    return apiSuccess(data, { requestId, status: 201 });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
