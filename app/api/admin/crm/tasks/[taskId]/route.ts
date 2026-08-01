import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { crmTaskUpdateSchema } from "@/lib/domain/schemas";

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { taskId } = await context.params;
    const input = crmTaskUpdateSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["support", "admin"]);
    const { data, error } = await supabase
      .from("crm_tasks")
      .update({ completed_at: input.completed ? new Date().toISOString() : null })
      .eq("id", taskId)
      .select("id, lead_id, completed_at")
      .single();
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
