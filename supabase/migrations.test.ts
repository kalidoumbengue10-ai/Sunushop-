import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(__dirname, "migrations");
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sql = migrationFiles
  .map((name) => readFileSync(join(migrationDirectory, name), "utf8"))
  .join("\n")
  .replaceAll("\r\n", "\n");

describe("contrat statique des migrations", () => {
  it("garde les migrations versionnées et ordonnées", () => {
    expect(migrationFiles.length).toBeGreaterThanOrEqual(6);
    migrationFiles.forEach((name, index) => {
      expect(name).toMatch(/^\d{12,14}_[a-z0-9_]+\.sql$/);
      if (index > 0) {
        expect(name > migrationFiles[index - 1]).toBe(true);
      }
    });
    expect(
      new Set(migrationFiles.map((name) => name.split("_", 1)[0])).size,
    ).toBe(migrationFiles.length);
  });

  it("active RLS sur chaque table métier sensible", () => {
    [
      "merchant_accounts",
      "verification_cases",
      "verification_documents",
      "products",
      "orders",
      "direct_payment_declarations",
      "merchant_subscriptions",
      "audit_events",
      "crm_leads",
      "crm_lead_notes",
      "crm_tasks",
      "crm_lead_events",
      "workspace_invitations",
      "addresses",
      "courier_memberships",
      "deliveries",
      "delivery_events",
    ].forEach((table) => {
      expect(sql).toContain(
        `alter table public.${table} enable row level security;`,
      );
    });
  });

  it("garde les fonctions atomiques et les buckets privés attendus", () => {
    expect(sql).toContain("create function public.create_order_batch");
    expect(sql).toContain("create function public.review_verification_case");
    expect(sql).toContain("create function public.declare_direct_payment");
    expect(sql).toContain("create function public.complete_delivery_stage");
    expect(sql).toContain("subscription_expires_j7");
    expect(sql).toContain("subscription_expires_j2");
    expect(sql).toContain("'merchant-verification',\n  false");
    expect(sql).toContain("grant execute");
    expect(sql).toContain("create type public.crm_lead_status");
    expect(sql).toContain("create policy crm_leads_admin_access");
  });

  it("modernise l’espace marchand via une migration additive", () => {
    expect(sql).toContain("create table public.delivery_category_rates");
    expect(sql).toContain("create table public.merchant_order_counters");
    expect(sql).toContain("create function public.save_merchant_product_variants");
    expect(sql).toContain("add column option_names text[]");
    expect(sql).toContain("create or replace function public.reorder_merchant_product_media");
    expect(sql).toContain("MEDIA_ORDER_INCOMPLETE");
    expect(sql).toContain("highest_category_or_region_default");
    expect(sql).toContain("create function public.admin_activate_test_subscription");
    expect(sql).toContain("subscription.test_activate");
    expect(sql).toContain("Les seeds locaux ne sont pas exécutés automatiquement");
    expect(sql).toContain("('essential', 'Essentiel', 4900");
  });
});
