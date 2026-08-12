import type { Coordinates } from "@/lib/domain/geo";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const SENEGAL_MAP_CENTER: [number, number] = [-14.4524, 14.4974];
export const SENEGAL_MAP_ZOOM = 6;

export function toLngLat(value: Coordinates): [number, number] {
  return [value.longitude, value.latitude];
}
