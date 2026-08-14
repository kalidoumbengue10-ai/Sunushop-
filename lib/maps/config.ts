import type { Coordinates } from "@/lib/domain/geo";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const SENEGAL_MAP_CENTER: [number, number] = [-14.4524, 14.4974];
export const SENEGAL_MAP_ZOOM = 6;

export function toLngLat(value: Coordinates): [number, number] {
  return [value.longitude, value.latitude];
}

let workerUrlConfigured = false;

// Sous l'import dynamique de maplibre-gl utilisé par ce projet, le bundler
// Next.js ne résout pas l'URL du Web Worker que MapLibre crée en interne
// pour parser les tuiles vectorielles : le worker ne se crée alors jamais,
// sans qu'aucune erreur ne soit levée (seul le fond raster basse résolution
// reste visible, sans routes ni labels). À appeler avant tout `new Map()`.
export function configureMapWorker(setWorkerUrl: (value: string) => void) {
  if (workerUrlConfigured) return;
  workerUrlConfigured = true;
  setWorkerUrl(`${window.location.origin}/maplibre-gl-worker.mjs`);
}
