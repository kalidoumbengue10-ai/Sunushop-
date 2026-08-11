import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["support", "admin"]);
    const { data, error } = await (supabase as any)
      .from("order_disputes")
      .select("id, order_id, merchant_id, buyer_id, reason, status, opened_at, resolution, resolution_note, orders!inner(public_code, buyer_id, total_xof), merchant_accounts(public_name)")
      .in("status", ["open", "refund_required"])
      .order("opened_at", { ascending: true });
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
