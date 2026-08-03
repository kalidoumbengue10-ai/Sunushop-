import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("id, public_code, status, payment_method, total_xof, recipient_snapshot, created_at, merchant_accounts!inner(public_name, slug), deliveries(id, status, delivered_at)")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
