import type { GeoPlace } from "@/lib/domain/geo";

export type PeliasFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { label?: string; name?: string; region?: string; locality?: string; county?: string };
};

export function normalizePeliasFeature(feature: PeliasFeature): GeoPlace | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null;
  const properties = feature.properties ?? {};
  return {
    label: properties.label ?? properties.name ?? "Lieu sélectionné",
    region: properties.region ?? null,
    city: properties.locality ?? properties.county ?? null,
    latitude: coordinates[1],
    longitude: coordinates[0],
  };
}
