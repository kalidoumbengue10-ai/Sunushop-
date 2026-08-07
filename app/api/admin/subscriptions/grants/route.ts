import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["admin"]);
    const { data, error } = await supabase
      .from("subscription_grants")
      .select("id, merchant_id, plan_id, days, reason, current_period_ends_at, created_at, merchant_accounts(public_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
