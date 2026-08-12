import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit, getRequestIp } from "@/lib/api/security";
import { isInSenegalBounds } from "@/lib/domain/geo";
import { reversePlace } from "@/lib/maps/openroute-service";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lng"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isInSenegalBounds({ latitude, longitude })) {
      throw new ApiError(400, "MAP_COORDINATES_INVALID", "Choisissez un point situé au Sénégal.");
    }
    const ip = await getRequestIp();
    await Promise.all([
      enforceRateLimit({ key: ip, action: "maps.reverse.ip", windowSeconds: 60, maxRequests: 10 }),
      enforceRateLimit({ key: "global", action: "maps.reverse.global.minute", windowSeconds: 60, maxRequests: 80 }),
      enforceRateLimit({ key: "global", action: "maps.reverse.global.day", windowSeconds: 86_400, maxRequests: 800 }),
    ]);
    return apiSuccess({ place: await reversePlace({ latitude, longitude }) }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
