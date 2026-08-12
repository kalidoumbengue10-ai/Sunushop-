import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit, getRequestIp } from "@/lib/api/security";
import { isInSenegalBounds } from "@/lib/domain/geo";
import { searchPlaces } from "@/lib/maps/openroute-service";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (query.length < 4 || query.length > 120) throw new ApiError(400, "MAP_QUERY_INVALID", "Saisissez au moins quatre caractères.");
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lng"));
    const focus = Number.isFinite(latitude) && Number.isFinite(longitude) && isInSenegalBounds({ latitude, longitude })
      ? { latitude, longitude }
      : undefined;
    const ip = await getRequestIp();
    await Promise.all([
      enforceRateLimit({ key: ip, action: "maps.search.ip", windowSeconds: 60, maxRequests: 15 }),
      enforceRateLimit({ key: "global", action: "maps.search.global.minute", windowSeconds: 60, maxRequests: 80 }),
      enforceRateLimit({ key: "global", action: "maps.search.global.day", windowSeconds: 86_400, maxRequests: 800 }),
    ]);
    return apiSuccess({ items: await searchPlaces(query, focus) }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
