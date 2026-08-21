import { createClient } from "@supabase/supabase-js";
import { assertDisposableLocalE2E } from "./local-environment";

const buckets = [
  "merchant-verification",
  "product-media",
  "merchant-branding",
  "courier-verification",
  "courier-profiles",
];

export default async function globalTeardown() {
  const local = assertDisposableLocalE2E();
  const admin = createClient(local.url, local.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let remainingStorageObjects = 0;
  async function retryStorage<T extends { error: { message: string } | null }>(operation: () => PromiseLike<T>): Promise<T> {
    let lastResult: T | undefined;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      lastResult = await operation();
      if (!lastResult.error) return lastResult;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
    return lastResult!;
  }
  async function listAllPaths(bucket: string, prefix = ""): Promise<string[]> {
    const { data, error } = await retryStorage(() => admin.storage.from(bucket).list(prefix, { limit: 1000 }));
    if (error && !/not found/i.test(error.message)) throw error;
    const paths: string[] = [];
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) paths.push(path);
      else paths.push(...await listAllPaths(bucket, path));
    }
    return paths;
  }

  const { data: merchants, error: merchantReadError } = await admin.from("merchant_accounts").select("id");
  if (merchantReadError) throw merchantReadError;
  for (const merchant of merchants ?? []) {
    const { error } = await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: merchant.id });
    if (error) throw error;
  }

  // La base vient d'être reconstruite pour ce run et ne contient aucune donnée
  // utilisateur légitime. Ces lignes sans rattachement marchand doivent donc
  // disparaître elles aussi, notamment les notifications d'invitation/admin.
  const { error: notificationDeleteError } = await admin
    .from("notification_outbox")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (notificationDeleteError) throw notificationDeleteError;
  const { error: leadDeleteError } = await admin
    .from("crm_leads")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (leadDeleteError) throw leadDeleteError;

  for (const bucket of buckets) {
    const paths = await listAllPaths(bucket);
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await retryStorage(() => admin.storage.from(bucket).remove(paths.slice(index, index + 100)));
      if (error) throw error;
    }
    remainingStorageObjects += (await listAllPaths(bucket)).length;
  }

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
    }
    if (data.users.length === 0) break;
  }

  const tables = ["merchant_accounts", "products", "orders", "notification_outbox", "profiles", "courier_profiles"] as const;
  const [tableCounts, { data: remainingUsers, error: usersError }] = await Promise.all([
    Promise.all(tables.map(async (table) => {
      const { count, error } = await admin.from(table).select("id", { count: "exact", head: true });
      if (error) throw error;
      return [table, count ?? 0] as const;
    })),
    admin.auth.admin.listUsers({ page: 1, perPage: 1 }),
  ]);
  if (usersError) throw usersError;
  const leftovers = tableCounts.filter(([, count]) => count !== 0);
  if (leftovers.length || remainingUsers.users.length !== 0 || remainingStorageObjects !== 0) {
    throw new Error(`Nettoyage E2E incomplet : ${leftovers.map(([table, count]) => `${table}=${count}`).join(", ") || "tables=0"}, comptes=${remainingUsers.users.length}, fichiers=${remainingStorageObjects}.`);
  }
}
