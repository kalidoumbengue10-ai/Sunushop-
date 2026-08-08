"use client";

import { useEffect, useRef } from "react";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";

const CATALOG_TABLES = ["products", "product_variants", "product_media", "inventory_items"] as const;
const DEBOUNCE_MS = 1000;

/**
 * Écoute les changements du catalogue (produits, variantes, photos, stock)
 * et déclenche `onChange` au plus une fois par seconde, pour refléter en
 * temps réel les modifications d'un marchand côté client sans dépendre de
 * la revalidation ISR ni d'un rechargement manuel.
 */
export function useCatalogSync(onChange: () => void) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let supabase: ReturnType<typeof getBrowserSupabase>;
    try {
      supabase = getBrowserSupabase();
    } catch {
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => onChangeRef.current(), DEBOUNCE_MS);
    };
    const channel = CATALOG_TABLES.reduce(
      (built, table) => built.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh),
      supabase.channel("catalog-sync"),
    ).subscribe();
    return () => {
      if (timeout) clearTimeout(timeout);
      channel.unsubscribe();
    };
  }, []);
}
