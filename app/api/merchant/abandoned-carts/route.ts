import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const merchantId = url.searchParams.get("merchantId") ?? "";
    const { admin } = await requireActiveMerchantAccess(merchantId, ["owner", "manager", "fulfillment"]);

    const { data: items, error } = await admin
      .from("cart_items")
      .select("cart_id, carts!inner(status)")
      .eq("merchant_id", merchantId)
      .eq("carts.status", "abandoned");
    if (error) throw error;

    const count = new Set((items ?? []).map((item) => item.cart_id)).size;
    return apiSuccess({ count }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
