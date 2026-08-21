import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireFulfillment } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { hasCoordinatePair } from "@/lib/domain/geo";
import { calculateRoute } from "@/lib/maps/openroute-service";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
    const admin = requireAdminClient();
    const { data: order, error } = await admin.from("orders").select("id, merchant_id, delivery_fee_xof, recipient_snapshot, merchant_accounts!inner(pickup_latitude, pickup_longitude)").eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
    await requireFulfillment(order.merchant_id);
    const merchant = Array.isArray(order.merchant_accounts) ? order.merchant_accounts[0] : order.merchant_accounts;
    const recipient = order.recipient_snapshot as Record<string, unknown>;
    const origin = { latitude: Number(merchant?.pickup_latitude), longitude: Number(merchant?.pickup_longitude) };
    const destination = { latitude: Number(recipient?.latitude), longitude: Number(recipient?.longitude) };
    if (!hasCoordinatePair(origin) || !hasCoordinatePair(destination)) throw new ApiError(422, "DELIVERY_ROUTE_COORDINATES_MISSING", "Les positions du retrait ou du client sont incomplètes.");
    const route = await calculateRoute(origin, destination);
    return apiSuccess({ distanceMeters: Math.round(route.distanceMeters), durationSeconds: Math.round(route.durationSeconds), clientDeliveryFeeXof: order.delivery_fee_xof, suggestedCourierFeeXof: order.delivery_fee_xof }, { requestId });
  } catch (error) { return apiFailure(error, requestId); }
}

