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
const email = `e2e-signup-${runId}@example.test`;

const createdUserIds: string[] = [];
const createdMerchantIds: string[] = [];

test.afterAll(async () => {
  for (const merchantId of createdMerchantIds) {
    await admin.from("verification_documents").delete().eq("merchant_id", merchantId);
    await admin.from("verification_events").delete().eq("merchant_id", merchantId);
    await admin.from("verification_cases").delete().eq("merchant_id", merchantId);
    await admin.from("merchant_members").delete().eq("merchant_id", merchantId);
    await admin.from("merchant_accounts").delete().eq("id", merchantId);
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("un nouvel utilisateur voit bien l'étape 1 (Mon commerce), sans saut d'étape", async ({ page }) => {
  await page.goto("/creer-ma-boutique");

  // Etape 1 attendue en premier pour un visiteur non connecté.
  await expect(page.getByRole("heading", { name: "Votre commerce" })).toBeVisible();
  await expect(page.getByLabel("Nom et prénom")).toBeVisible();
  await expect(page.getByLabel("Nom du commerce")).toBeVisible();

  await page.getByLabel("Nom et prénom").fill("E2E Signup Test");
  await page.getByLabel("Nom du commerce").fill(`Boutique E2E ${runId}`);
  await page.getByLabel("Téléphone").fill("+221770000000");
  await page.getByLabel("Statut de l’activité").selectOption("informal");
  await page.getByLabel("Comment vendez-vous aujourd’hui ?").fill("WhatsApp");

  await page.getByRole("button", { name: "Continuer" }).click();

  // Etape 2 : "Mon accès" doit s'afficher, avec un bouton Retour fonctionnel.
  await expect(page.getByRole("heading", { name: "Votre accès" })).toBeVisible();
  const backButton = page.getByRole("button", { name: "Retour" });
  await expect(backButton).toBeVisible();
  await backButton.click();
  await expect(page.getByRole("heading", { name: "Votre commerce" })).toBeVisible();
  // Le formulaire doit garder les valeurs saisies après retour.
  await expect(page.getByLabel("Nom du commerce")).toHaveValue(`Boutique E2E ${runId}`);

  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Votre accès" })).toBeVisible();

  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer ma boutique" }).click();

  // Etape 3 : pièce d'identité. Le bouton Retour doit maintenant exister.
  await expect(page.getByRole("heading", { name: "Votre pièce d’identité" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();

  // Etape 4 : lettre d'intention. Le bouton Retour doit ramener à l'étape 3.
  await expect(page.getByRole("heading", { name: "Votre lettre d’intention" })).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByRole("heading", { name: "Votre pièce d’identité" })).toBeVisible();

  const { data: authUsers } = await admin.auth.admin.listUsers();
  const created = authUsers.users.find((user) => user.email === email);
  if (created) createdUserIds.push(created.id);
  const { data: merchant } = await admin.from("merchant_accounts").select("id").eq("email", email).maybeSingle();
  if (merchant) createdMerchantIds.push(merchant.id);
});
