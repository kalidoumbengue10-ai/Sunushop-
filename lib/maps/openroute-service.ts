import "server-only";

import { ApiError } from "@/lib/api/errors";
import type { Coordinates, GeoPlace } from "@/lib/domain/geo";
import { normalizePeliasFeature, type PeliasFeature } from "@/lib/maps/normalize";

const API_BASE_URL = "https://api.openrouteservice.org";
const REQUEST_TIMEOUT_MS = 8_000;

type PeliasResponse = { features?: PeliasFeature[] };

function apiKey() {
  const value = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!value) {
    throw new ApiError(503, "MAPS_SEARCH_UNAVAILABLE", "La recherche cartographique est temporairement indisponible.");
  }
  return value;
}

async function orsFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey(),
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => {
    throw new ApiError(503, "MAPS_PROVIDER_UNAVAILABLE", "Le service cartographique ne répond pas. Placez le point manuellement.");
  });
  if (!response.ok) {
    const status = response.status === 429 ? 429 : 503;
    throw new ApiError(status, response.status === 429 ? "MAPS_QUOTA_REACHED" : "MAPS_PROVIDER_UNAVAILABLE", "Le service cartographique est temporairement indisponible.");
  }
  return response;
}

export async function searchPlaces(query: string, focus?: Coordinates) {
  const params = new URLSearchParams({ text: query, size: "5", "boundary.country": "SN" });
  if (focus) {
    params.set("focus.point.lat", String(focus.latitude));
    params.set("focus.point.lon", String(focus.longitude));
  }
  const response = await orsFetch(`/geocode/autocomplete?${params}`);
  const payload = await response.json() as PeliasResponse;
  return (payload.features ?? []).map(normalizePeliasFeature).filter((place): place is GeoPlace => place !== null);
}

export async function reversePlace(coordinates: Coordinates) {
  const params = new URLSearchParams({
    "point.lat": String(coordinates.latitude),
    "point.lon": String(coordinates.longitude),
    size: "1",
  });
  const response = await orsFetch(`/geocode/reverse?${params}`);
  const payload = await response.json() as PeliasResponse;
  return payload.features?.map(normalizePeliasFeature).find((place): place is GeoPlace => place !== null) ?? null;
}

export type RouteSnapshot = {
  geometry: { type: "LineString"; coordinates: number[][] };
  distanceMeters: number;
  durationSeconds: number;
  provider: "openrouteservice";
  calculatedAt: string;
};

export async function calculateRoute(origin: Coordinates, destination: Coordinates): Promise<RouteSnapshot> {
  const response = await orsFetch("/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coordinates: [[origin.longitude, origin.latitude], [destination.longitude, destination.latitude]] }),
  });
  const payload = await response.json() as {
    features?: Array<{
      geometry?: { type?: string; coordinates?: number[][] };
      properties?: { summary?: { distance?: number; duration?: number } };
    }>;
  };
  const feature = payload.features?.[0];
  const summary = feature?.properties?.summary;
  if (feature?.geometry?.type !== "LineString" || !feature.geometry.coordinates || !summary) {
    throw new ApiError(503, "MAPS_PROVIDER_INVALID_RESPONSE", "L’itinéraire n’a pas pu être calculé.");
  }
  return {
    geometry: { type: "LineString", coordinates: feature.geometry.coordinates },
    distanceMeters: summary.distance ?? 0,
    durationSeconds: summary.duration ?? 0,
    provider: "openrouteservice",
    calculatedAt: new Date().toISOString(),
  };
}
