import { expect, test as base } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertDisposableLocalE2E } from "./local-environment";

function createLocalAdmin() {
  const local = assertDisposableLocalE2E();
  return createClient(local.url, local.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

type StorageResource = { bucket: string; path: string };
type LocalResources = {
  admin: ReturnType<typeof createLocalAdmin>;
  runId: string;
  email: (role: string) => string;
  registerUser: (id: string) => void;
  registerMerchant: (id: string) => void;
  registerStorage: (bucket: string, path: string) => void;
};

export const test = base.extend<{ localResources: LocalResources }>({
  localResources: async ({}, provideFixture, testInfo) => {
    const admin = createLocalAdmin();
    const runId = `e2e-${testInfo.workerIndex}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const userIds: string[] = [];
    const merchantIds: string[] = [];
    const storage: StorageResource[] = [];
    await provideFixture({
      admin,
      runId,
      email: (role) => `${role}-${runId}@example.test`,
      registerUser: (id) => userIds.push(id),
      registerMerchant: (id) => merchantIds.push(id),
      registerStorage: (bucket, path) => storage.push({ bucket, path }),
    });

    const failures: string[] = [];
    for (const resource of storage.reverse()) {
      const { error } = await admin.storage.from(resource.bucket).remove([resource.path]);
      if (error) failures.push(`${resource.bucket}/${resource.path}: ${error.message}`);
    }
    for (const id of [...new Set(merchantIds)].reverse()) {
      const { error } = await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: id });
      if (error) failures.push(`merchant ${id}: ${error.message}`);
    }
    for (const id of [...new Set(userIds)].reverse()) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) failures.push(`user ${id}: ${error.message}`);
    }
    if (failures.length) throw new Error(`Nettoyage E2E incomplet:\n${failures.join("\n")}`);
  },
});

export { expect };
