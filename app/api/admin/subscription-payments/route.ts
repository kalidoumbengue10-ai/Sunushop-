import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["admin"]);
    const status = new URL(request.url).searchParams.get("status") ?? "pending";
    const { data, error } = await supabase
      .from("subscription_payment_submissions")
      .select(
        "id, merchant_id, plan_id, channel, external_reference, amount_xof, paid_at, status, created_at, merchant_accounts!inner(public_name, slug)",
      )
      .eq("status", status)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
