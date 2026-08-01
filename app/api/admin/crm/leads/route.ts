import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { crmLeadStatusSchema } from "@/lib/domain/schemas";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["support", "admin"]);
    const statusValue = new URL(request.url).searchParams.get("status");
    const status = statusValue ? crmLeadStatusSchema.parse(statusValue) : undefined;
    let query = supabase
      .from("crm_leads")
      .select("id, source, full_name, business_name, email, phone, city, business_type, sales_channel, message, status, priority, last_contacted_at, next_follow_up_at, converted_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
