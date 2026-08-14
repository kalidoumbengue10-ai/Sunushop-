import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// MapLibre GL charge son moteur de rendu dans un Web Worker via
// new Worker(new URL(...), { type: "module" }) : sous l'import dynamique
// utilisé par components/location-map.tsx, le bundler Next.js ne résout
// pas cette URL, et le worker ne se crée jamais (échec silencieux — la
// carte affiche alors uniquement le fond raster basse résolution, sans
// aucune route ni aucun nom de lieu). On sert donc le worker et son
// module partagé comme assets statiques, référencés explicitement via
// setWorkerUrl() dans location-map.tsx.
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(projectRoot, "node_modules", "maplibre-gl", "dist");
const targetDir = join(projectRoot, "public");
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(targetDir, { recursive: true });
for (const file of files) {
  copyFileSync(join(sourceDir, file), join(targetDir, file));
}
console.log(`maplibre-gl worker assets synchronisés vers public/ (${files.join(", ")}).`);
