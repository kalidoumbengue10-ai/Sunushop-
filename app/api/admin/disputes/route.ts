import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["support", "admin"]);
    const { data, error } = await supabase
      .from("payment_escrows")
      .select(
        "id, order_id, merchant_id, amount_xof, status, dispute_opened_at, dispute_reason, dispute_resolved_at, dispute_resolution, orders!inner(public_code, buyer_id), merchant_accounts(public_name)",
      )
      .in("status", ["disputed"])
      .order("dispute_opened_at", { ascending: true });
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
