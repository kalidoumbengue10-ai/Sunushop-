import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { crmTaskSchema } from "@/lib/domain/schemas";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = crmTaskSchema.parse(await request.json());
    const { user, supabase } = await requireAdminRole(["support", "admin"]);
    const { data, error } = await supabase
      .from("crm_tasks")
      .insert({ lead_id: id, title: input.title, due_at: input.dueAt ?? null, assigned_to: user.id, created_by: user.id })
      .select("id, title, assigned_to, due_at, completed_at, created_at")
      .single();
    if (error) throw error;
    const { error: eventError } = await supabase.from("crm_lead_events").insert({
      lead_id: id,
      actor_id: user.id,
      event_type: "task_created",
      summary: "Une relance a été planifiée.",
    });
    if (eventError) throw eventError;
    return apiSuccess(data, { requestId, status: 201 });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
