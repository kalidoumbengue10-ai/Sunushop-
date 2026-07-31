"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/config/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  if (!client) {
    client = createBrowserClient(
      config.NEXT_PUBLIC_SUPABASE_URL,
      config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  }

  return client;
}
