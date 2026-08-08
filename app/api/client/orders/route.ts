import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("id, merchant_id, public_code, status, payment_method, total_xof, loyalty_points_redeemed, loyalty_discount_xof, loyalty_points_earned, recipient_snapshot, created_at, merchant_accounts!inner(public_name, slug), deliveries(id, status, delivered_at), order_items(id, product_snapshot, quantity, line_total_xof)")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
