import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(__dirname, "migrations", "202608240001_courier_e2e_hardening.sql"),
  "utf8",
).replaceAll("\r\n", "\n");

function functionSql(name: string, nextMarker: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf(nextMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("durcissement du parcours livreur", () => {
  it("conserve l’historique et n’autorise qu’une livraison active par commande", () => {
    expect(migration).toContain("drop constraint if exists deliveries_order_id_key");
    expect(migration).toContain("create unique index if not exists deliveries_one_active_order_idx");
    expect(migration).toContain("where status in ('assigned', 'accepted', 'at_pickup', 'picked_up', 'in_transit')");
  });

  it("annule l’ancienne affectation avant d’accepter une offre reprogrammée", () => {
    const sql = functionSql("accept_delivery_offer", "revoke all on function public.accept_delivery_offer");
    expect(sql).toContain("for update");
    expect(sql).toContain("if v_previous.status in ('picked_up', 'in_transit')");
    expect(sql).toContain("set status = 'cancelled'");
    expect(sql.indexOf("set status = 'cancelled'")).toBeLessThan(sql.indexOf("insert into public.deliveries"));
    expect(sql).toContain("v_offer.expires_at <= timezone('utc', now())");
  });

  it("réouvre atomiquement la commande après un échec sans la rembourser", () => {
    const sql = functionSql("report_delivery_failure", "revoke all on function public.report_delivery_failure");
    expect(sql).toContain("set status = 'failed'");
    expect(sql).toContain("set status = 'ready_for_handoff'");
    expect(sql).toContain("'reprogrammable', true");
    expect(sql).not.toContain("refund");
    expect(sql).not.toContain("cancelled");
  });

  it("verrouille les essais de code et calcule les agrégats hors pagination", () => {
    const verifySql = functionSql("verify_delivery_code_atomic", "revoke all on function public.verify_delivery_code_atomic");
    expect(verifySql).toContain("for update");
    expect(verifySql).toContain("least(v_attempts + 1, v_delivery.code_attempt_limit)");
    expect(verifySql).toContain("extensions.digest(p_code, 'sha256')");
    expect(migration).toContain("create or replace function public.courier_delivery_dashboard_stats()");
  });

  it("rend le téléphone profil globalement unique et les offres expirables", () => {
    expect(migration).toContain("message = 'COURIER_PHONE_DUPLICATE'");
    expect(migration).toContain("create unique index if not exists courier_profiles_phone_unique_idx");
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("'expired'");
  });
});
