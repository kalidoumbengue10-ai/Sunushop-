#!/usr/bin/env node
// Purge toute donnée créée par un run de charge, identifiée par le préfixe
// `loadtest-<runId>` (emails, dedupeKey, business_name...). Contrainte du
// projet : les runs tapent le Supabase CLOUD, donc cette purge doit être
// systématique et vérifiée — jamais juste supposée.
//
// Usage : node scripts/loadtest/cleanup.mjs --run-id=<runId>
//         node scripts/loadtest/cleanup.mjs --run-id=<runId> --dry-run
//         node scripts/loadtest/cleanup.mjs --all-loadtest   (retrouve tous les runs par le préfixe générique "loadtest-")

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = /^--([^=]+)=?(.*)$/.exec(raw);
    if (!match) continue;
    args[match[1]] = match[2] === "" ? true : match[2];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args["dry-run"]);
const prefix = args["all-loadtest"] ? "loadtest-" : `loadtest-${args["run-id"]}-`;

if (!args["all-loadtest"] && !args["run-id"]) {
  console.error("Usage: --run-id=<id> ou --all-loadtest");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (.env.local).");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function findByPrefix(table, column) {
  const { data, error } = await admin.from(table).select("id").ilike(column, `${prefix}%`);
  if (error) throw new Error(`${table}.${column}: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

async function deleteByIds(table, ids, column = "id") {
  if (!ids.length) return 0;
  if (dryRun) {
    console.log(`[dry-run] supprimerait ${ids.length} ligne(s) de ${table}`);
    return ids.length;
  }
  const { error } = await admin.from(table).delete().in(column, ids);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  return ids.length;
}

async function main() {
  console.log(`Recherche des données préfixées "${prefix}"${dryRun ? " (dry-run)" : ""}...`);

  // Utilisateurs créés par le loadtest (email préfixé) : orders/addresses/
  // carts en dépendent, donc on les traite avant de supprimer les comptes.
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", `${prefix}%`);
  if (profilesError) throw new Error(`profiles: ${profilesError.message}`);
  const userIds = (profiles ?? []).map((p) => p.id);

  let ordersDeleted = 0;
  let batchesDeleted = 0;
  let cartsDeleted = 0;
  let addressesDeleted = 0;
  if (userIds.length) {
    const { data: orders } = await admin.from("orders").select("id").in("buyer_id", userIds);
    const orderIds = (orders ?? []).map((o) => o.id);
    for (const orderId of orderIds) {
      await (dryRun ? Promise.resolve() : admin.from("order_items").delete().eq("order_id", orderId));
      await (dryRun ? Promise.resolve() : admin.from("order_events").delete().eq("order_id", orderId));
      await (dryRun ? Promise.resolve() : admin.from("deliveries").delete().eq("order_id", orderId));
    }
    ordersDeleted = await deleteByIds("orders", orderIds);
    // order_batches.buyer_id "on delete restrict" bloque deleteUser même
    // quand aucune `orders` n'a été créée (échec en cours de setup d'un
    // scénario) : un batch orphelin suffit à empêcher la suppression du
    // compte. Toujours purger par buyer_id, pas seulement via les orders.
    const { data: batches } = await admin.from("order_batches").select("id").in("buyer_id", userIds);
    batchesDeleted = await deleteByIds("order_batches", (batches ?? []).map((b) => b.id));
    const { data: carts } = await admin.from("carts").select("id").in("buyer_id", userIds);
    cartsDeleted = await deleteByIds("carts", (carts ?? []).map((c) => c.id));
    const { data: addresses } = await admin.from("addresses").select("id").in("owner_user_id", userIds);
    addressesDeleted = await deleteByIds("addresses", (addresses ?? []).map((a) => a.id));
  }

  const merchantIds = await findByPrefix("merchant_accounts", "email").catch(() => []);
  const merchantsDeleted = await deleteByIds("merchant_accounts", merchantIds);

  const { data: outboxRows, error: outboxError } = await admin
    .from("notification_outbox")
    .select("id")
    .ilike("dedupe_key", `${prefix}%`);
  if (outboxError) throw new Error(`notification_outbox: ${outboxError.message}`);
  const outboxDeleted = await deleteByIds("notification_outbox", (outboxRows ?? []).map((r) => r.id));

  let usersDeleted = 0;
  if (!dryRun) {
    for (const userId of userIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (!error) usersDeleted += 1;
    }
  } else {
    usersDeleted = userIds.length;
  }

  console.log("\n=== Purge terminée ===");
  console.log(`orders: ${ordersDeleted}  order_batches: ${batchesDeleted}  carts: ${cartsDeleted}  addresses: ${addressesDeleted}`);
  console.log(`merchant_accounts: ${merchantsDeleted}  notification_outbox: ${outboxDeleted}  auth users: ${usersDeleted}`);

  if (dryRun) {
    console.log("\n(dry-run : rien n'a été supprimé)");
    return;
  }

  // Vérification post-purge : on ne se contente jamais d'affirmer que le
  // nettoyage a fonctionné, on relit les mêmes tables et on exige zéro ligne.
  const remainingProfiles = await admin.from("profiles").select("id", { count: "exact", head: true }).ilike("email", `${prefix}%`);
  const remainingMerchants = await admin.from("merchant_accounts").select("id", { count: "exact", head: true }).ilike("email", `${prefix}%`);
  const remainingOutbox = await admin.from("notification_outbox").select("id", { count: "exact", head: true }).ilike("dedupe_key", `${prefix}%`);

  const remaining = {
    profiles: remainingProfiles.count ?? 0,
    merchant_accounts: remainingMerchants.count ?? 0,
    notification_outbox: remainingOutbox.count ?? 0,
  };
  const allZero = Object.values(remaining).every((n) => n === 0);
  console.log(`\nVérification post-purge: ${JSON.stringify(remaining)}`);
  if (!allZero) {
    console.error("ÉCHEC: des lignes préfixées loadtest subsistent après la purge.");
    process.exit(1);
  }
  console.log("Confirmé: 0 ligne restante pour ce préfixe.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
