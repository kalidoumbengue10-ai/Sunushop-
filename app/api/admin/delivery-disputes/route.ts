import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    await requireAdminRole(["support", "admin"]);
    const { data, error } = await requireAdminClient()
      .from("delivery_disputes")
      .select("id, delivery_id, order_id, merchant_id, buyer_id, courier_membership_id, reason, status, resolution, opened_at, resolved_at, orders!inner(public_code, merchant_sequence), merchant_accounts!inner(public_name), courier_memberships!inner(display_name), delivery_dispute_events(id, event_type, message, created_at)")
      .order("opened_at", { ascending: true });
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
