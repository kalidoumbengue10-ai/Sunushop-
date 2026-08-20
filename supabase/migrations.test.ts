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
      "merchant_loyalty_settings",
      "loyalty_accounts",
      "loyalty_point_lots",
      "loyalty_entries",
      "loyalty_contributions",
      "loyalty_credit_payouts",
      "courier_payouts",
      "courier_payout_deliveries",
      "delivery_disputes",
      "delivery_dispute_events",
      "order_refunds",
      "order_disputes",
      "platform_payment_settings",
      "subscription_billing_periods",
      "subscription_value_ledger",
      "courier_profiles",
      "courier_verification_cases",
      "courier_verification_documents",
      "courier_verification_events",
    ].forEach((table) => {
      expect(sql).toContain(
        `alter table public.${table} enable row level security;`,
      );
    });
  });

  it("garde les fonctions atomiques et les buckets privés attendus", () => {
    expect(sql).toContain("create function public.create_order_batch");
    expect(sql).toContain("create function public.review_verification_case");
    expect(sql).toContain("create function public.submit_courier_verification_case");
    expect(sql).toContain("create function public.review_courier_verification_case");
    expect(sql).toContain("create function public.create_courier_membership_invitation");
    expect(sql).toContain("create function public.respond_to_courier_invitation");
    expect(sql).toContain("create function public.declare_direct_payment");
    expect(sql).toContain("create function public.complete_delivery_stage");
    expect(sql).toContain("subscription_expires_j7");
    expect(sql).toContain("subscription_expires_j2");
    expect(sql).toContain("'merchant-verification',\n  false");
    expect(sql).toContain("grant execute");
    expect(sql).toContain("create type public.crm_lead_status");
    expect(sql).toContain("create policy crm_leads_admin_access");
    expect(sql).toContain("create function public.consume_loyalty_points");
    expect(sql).toContain("create function public.reverse_order_loyalty");
    expect(sql).toContain("create function public.prepare_loyalty_credit_payouts");
    expect(sql).toContain("'courier-profiles', 'courier-profiles', false");
    expect(sql).toContain("create function public.record_courier_payout");
    expect(sql).toContain("create function public.void_courier_payout");
    expect(sql).toContain("create function public.set_failed_delivery_compensation");
    expect(sql).toContain("delivery_disputes_one_open_idx");
    expect(sql).toContain("create function public.open_delivery_dispute");
    expect(sql).toContain("create function public.resolve_delivery_dispute");
    expect(sql).toContain("create function public.review_direct_payment");
    expect(sql).toContain("create function public.declare_order_refund");
    expect(sql).toContain("create function public.review_order_refund");
    expect(sql).toContain("create function public.resolve_direct_order_dispute");
    expect(sql).toContain("create function public.refresh_subscription_billing_periods");
    expect(sql).toContain("create function public.review_courier_payout");
    expect(sql).toContain("PAYTECH_DISABLED");
    expect(sql).toContain("revoke insert, update, delete on public.payment_intents");
    expect(sql).toContain("LOYALTY_PROGRAM_FROZEN");
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

  it("sépare durablement prospects, clients et valeurs d’abonnement", () => {
    expect(sql).toContain("add column if not exists customer_since timestamptz");
    expect(sql).toContain("create type public.subscription_value_origin");
    expect(sql).toContain("create table public.subscription_value_ledger");
    expect(sql).toContain("create trigger merchant_subscription_marks_customer");
    expect(sql).toContain("create trigger subscription_payment_records_value");
    expect(sql).toContain("create trigger subscription_grant_records_value");
    expect(sql).toContain("create trigger test_subscription_records_value");
    expect(sql).toContain("ma.customer_since is null");
    expect(sql).toContain("orders.payment_status in ('paid', 'refund_pending', 'refunded')");
    expect(sql).toContain("top_products jsonb");
    expect(sql).toContain("top_categories jsonb");
  });
});
