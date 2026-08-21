import { loadEnvConfig } from "@next/env";

export function assertDisposableLocalE2E() {
  loadEnvConfig(process.cwd());
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL manque pour les E2E locaux.");
  const url = new URL(rawUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`E2E refusés : Supabase doit être local, cible reçue ${url.hostname}.`);
  }
  const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107");
  if (!["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)) {
    throw new Error(`E2E refusés : l'application doit être locale, cible reçue ${baseUrl.hostname}.`);
  }
  if (process.env.SUNUSHOP_E2E_LOCAL_RESET !== "1") {
    throw new Error("E2E refusés : utilisez npm run test:e2e pour reconstruire une pile locale jetable.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manque pour les fixtures E2E.");
  }
  return { url: rawUrl, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
}
