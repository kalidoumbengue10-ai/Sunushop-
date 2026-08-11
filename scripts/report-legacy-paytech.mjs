import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const checks = [
  ["payment_intents", ["pending"]],
  ["payment_escrows", ["held", "disputed"]],
  ["merchant_payouts", ["pending", "sent", "failed"]],
  ["loyalty_credit_payouts", ["pending", "sent", "failed"]],
];

let openCount = 0;
for (const [table, statuses] of checks) {
  const { data, error } = await supabase.from(table).select("*").in("status", statuses).order("created_at", { ascending: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  openCount += data.length;
  process.stdout.write(`\n${table}: ${data.length} enregistrement(s) ouvert(s)\n`);
  if (data.length) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

const { data: unsettledLoyalty, error: loyaltyError } = await supabase
  .from("loyalty_contributions")
  .select("*")
  .is("payout_id", null)
  .neq("platform_share_xof", 0)
  .order("created_at", { ascending: true });
if (loyaltyError) throw new Error(`loyalty_contributions: ${loyaltyError.message}`);
openCount += unsettledLoyalty.length;
process.stdout.write(`\nloyalty_contributions: ${unsettledLoyalty.length} contribution(s) à régler manuellement\n`);
if (unsettledLoyalty.length) process.stdout.write(`${JSON.stringify(unsettledLoyalty, null, 2)}\n`);

process.stdout.write(`\nTotal à traiter avant bascule : ${openCount}\n`);
if (openCount) process.exitCode = 2;
