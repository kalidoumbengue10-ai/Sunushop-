import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/api/security";
import { hasCoordinatePair } from "@/lib/domain/geo";
import { calculateRoute, type RouteSnapshot } from "@/lib/maps/openroute-service";

const terminalStatuses = new Set(["delivered", "failed", "cancelled"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("deliveries")
      .select("id, status, route_snapshot, pickup_snapshot, courier_memberships!inner(courier_user_id), orders!inner(recipient_snapshot)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const delivery = data as unknown as {
      id: string;
      status: string;
      route_snapshot: RouteSnapshot | null;
      pickup_snapshot: Record<string, unknown>;
      courier_memberships: { courier_user_id: string } | Array<{ courier_user_id: string }>;
      orders: { recipient_snapshot: Record<string, unknown> } | Array<{ recipient_snapshot: Record<string, unknown> }>;
    } | null;
    const membership = delivery && (Array.isArray(delivery.courier_memberships) ? delivery.courier_memberships[0] : delivery.courier_memberships);
    if (!delivery || membership?.courier_user_id !== user.id) throw new ApiError(404, "DELIVERY_NOT_FOUND", "Livraison introuvable.");
    if (terminalStatuses.has(delivery.status)) throw new ApiError(410, "DELIVERY_ROUTE_EXPIRED", "L’itinéraire n’est plus disponible après la mission.");
    if (delivery.route_snapshot) return apiSuccess(delivery.route_snapshot, { requestId });

    const order = Array.isArray(delivery.orders) ? delivery.orders[0] : delivery.orders;
    const pickup = {
      latitude: Number(delivery.pickup_snapshot.latitude),
      longitude: Number(delivery.pickup_snapshot.longitude),
    };
    const recipient = {
      latitude: Number(order?.recipient_snapshot.latitude),
      longitude: Number(order?.recipient_snapshot.longitude),
    };
    if (!hasCoordinatePair(pickup) || !hasCoordinatePair(recipient)) {
      throw new ApiError(422, "DELIVERY_ROUTE_COORDINATES_MISSING", "Les coordonnées de cette mission sont incomplètes.");
    }
    await Promise.all([
      enforceRateLimit({ key: user.id, action: "maps.route.user", windowSeconds: 60, maxRequests: 10 }),
      enforceRateLimit({ key: "global", action: "maps.route.global.minute", windowSeconds: 60, maxRequests: 30 }),
      enforceRateLimit({ key: "global", action: "maps.route.global.day", windowSeconds: 86_400, maxRequests: 1_800 }),
    ]);
    const route = await calculateRoute(pickup, recipient);
    const { error: updateError } = await admin.from("deliveries").update({ route_snapshot: route }).eq("id", id).is("route_snapshot", null);
    if (updateError) throw updateError;
    return apiSuccess(route, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
