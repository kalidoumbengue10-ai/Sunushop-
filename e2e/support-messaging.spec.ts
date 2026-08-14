import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Les variables Supabase E2E sont absentes.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const password = `SunuShop-E2E-${crypto.randomUUID()}!`;
const email = `e2e-support-${runId}@example.test`;

let userId: string | undefined;

test.afterAll(async () => {
  if (!userId) return;
  await admin.from("messages").delete().eq("sender_id", userId);
  await admin.from("conversations").delete().eq("buyer_id", userId);
  await admin.auth.admin.deleteUser(userId);
});

test("le bouton support ouvre un fil de discussion sans erreur", async ({ page, context }) => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "E2E Support", e2e_run_id: runId },
  });
  if (error || !data.user) throw error ?? new Error("Compte E2E non créé.");
  userId = data.user.id;

  const signInResponse = await context.request.post("/api/auth/password/sign-in", {
    data: { email, password },
  });
  expect(signInResponse.status(), await signInResponse.text()).toBe(200);

  await page.goto("/aide");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.getByRole("button", { name: "Discuter avec un admin SunuShop" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();

  // Doit rediriger vers /messages sans afficher d'erreur interne.
  await expect(page).toHaveURL(/\/messages$/, { timeout: 10_000 });
  await expect(page.getByText("Une erreur interne est survenue")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Mes conversations" })).toBeVisible();

  const { data: conversations, error: conversationsError } = await admin
    .from("conversations")
    .select("id, kind, buyer_id")
    .eq("buyer_id", userId)
    .eq("kind", "buyer_support");
  expect(conversationsError).toBeNull();
  expect(conversations?.length ?? 0).toBeGreaterThan(0);
});
