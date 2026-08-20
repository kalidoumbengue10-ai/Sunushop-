import { createHmac } from "node:crypto";
import { expect, test, type APIResponse, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Les variables Supabase E2E sont absentes.");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const password = `SunuShop-Vivier-${crypto.randomUUID()}!`;
const created = { userIds: [] as string[], merchantIds: [] as string[], courierIds: [] as string[] };

async function responseData<T>(response: APIResponse, status = 200) {
  const payload = await response.json().catch(() => null) as { data?: T; error?: unknown } | null;
  expect(response.status(), JSON.stringify(payload)).toBe(status);
  return payload?.data as T;
}

async function activateButton(button: Locator) {
  await button.focus({ timeout: 15_000 });
  await button.press("Enter", { timeout: 15_000 });
}

async function createUser(email: string, name: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name, e2e_run_id: runId } });
  if (error || !data.user) throw error ?? new Error(`Utilisateur non créé : ${email}`);
  created.userIds.push(data.user.id);
  return data.user.id;
}

async function signIn(context: BrowserContext, email: string) {
  let lastResponse: APIResponse | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    lastResponse = await context.request.post("/api/auth/password/sign-in", { data: { email, password } });
    if (lastResponse.status() === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  await responseData(lastResponse!);
}

function decodeBase32(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.toUpperCase().replace(/=+$/u, "")) {
    const index = alphabet.indexOf(character);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function enableAdminMfa(page: Page) {
  await page.goto("/admin/securite");
  const enrollment = page.waitForResponse((response) => response.url().includes("/auth/v1/factors") && response.request().method() === "POST");
  await activateButton(page.getByRole("button", { name: /Configurer la vérification en deux étapes/i }));
  const payload = await (await enrollment).json() as { totp?: { secret?: string } };
  const secret = payload.totp?.secret;
  if (!secret) throw new Error("Secret TOTP absent de la reponse Supabase MFA.");
  await page.getByLabel(/Code à 6 chiffres/i).fill(totp(secret));
  await activateButton(page.getByRole("button", { name: /Activer la protection/i }));
  await page.waitForURL("**/admin/crm", { timeout: 20_000 });
}

async function createMerchant(ownerUserId: string, ownerEmail: string) {
  const { data, error } = await admin.from("merchant_accounts").insert({
    owner_user_id: ownerUserId, kind: "informal", public_name: `Boutique vivier ${runId}`,
    slug: `boutique-vivier-${runId}`, description: "Boutique éphémère du test vivier livreur.",
    phone: "+221770008888", email: ownerEmail, region: "Dakar", city: "Dakar",
    wave_payment_number: "+221770008888",
    address_hint: "Point de retrait vivier", pickup_address_line: "3 rue du Vivier, Dakar",
    pickup_latitude: 14.7167, pickup_longitude: -17.4677,
    status: "active", verification_status: "approved", subscription_status: "active",
  }).select("id, public_name").single();
  if (error) throw error;
  created.merchantIds.push(data.id);
  const { error: memberError } = await admin.from("merchant_members").insert({ merchant_id: data.id, user_id: ownerUserId, role: "owner" });
  if (memberError) throw memberError;
  const periodEnd = new Date(Date.now() + 30 * 86_400_000);
  const { error: subscriptionError } = await admin.from("merchant_subscriptions").insert({
    merchant_id: data.id, plan_id: "essential", status: "active",
    starts_at: new Date().toISOString(), current_period_ends_at: periodEnd.toISOString(),
    grace_ends_at: new Date(periodEnd.getTime() + 3 * 86_400_000).toISOString(),
  });
  if (subscriptionError) throw subscriptionError;
  return data;
}

// Le livreur téléverse ses justificatifs via les routes signées, comme le fait
// l'uploader du navigateur.
async function uploadDocument(context: BrowserContext, caseId: string, documentType: string) {
  const authorization = await responseData<{ storagePath: string; token: string }>(
    await context.request.post(`/api/livreur/verifications/${caseId}/documents/upload-url`, {
      data: { documentType, fileName: `${documentType}.png`, fileSize: 2048, mimeType: "image/png" },
    }),
    201,
  );
  // PNG 1x1 valide : la validation serveur contrôle la signature du fichier.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const { error: uploadError } = await admin.storage
    .from("courier-verification")
    .uploadToSignedUrl(authorization.storagePath, authorization.token, png, { contentType: "image/png", upsert: false });
  if (uploadError) throw uploadError;
  await responseData(
    await context.request.post(`/api/livreur/verifications/${caseId}/documents/finalize`, {
      data: { documentType, storagePath: authorization.storagePath },
    }),
    201,
  );
}

async function cleanup() {
  for (const merchantId of created.merchantIds.reverse()) await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: merchantId });
  for (const courierId of created.courierIds.reverse()) await admin.from("courier_profiles").delete().eq("id", courierId);
  for (const userId of created.userIds.reverse()) await admin.auth.admin.deleteUser(userId);
}

test.describe.serial("vivier livreur : inscription autonome, vérification et invitation", () => {
  test.afterAll(cleanup);

  test("un livreur s’inscrit seul, est vérifié, puis rejoint une boutique sur invitation", async ({ browser }) => {
    test.setTimeout(600_000);
    const emails = {
      merchant: `vivier-merchant-${runId}@example.test`,
      courier: `vivier-courier-${runId}@example.test`,
      support: `vivier-support-${runId}@example.test`,
    };
    const courierPhone = `+2217700${String(Date.now()).slice(-5)}`;

    const merchantUser = await createUser(emails.merchant, "Marchand vivier");
    const supportUser = await createUser(emails.support, "Support vivier");
    const { error: roleError } = await admin.from("admin_roles").insert({ user_id: supportUser, role: "admin" });
    if (roleError) throw roleError;

    const merchantContext = await browser.newContext();
    const courierContext = await browser.newContext();
    const supportContext = await browser.newContext();
    await Promise.all([signIn(merchantContext, emails.merchant), signIn(supportContext, emails.support)]);
    const merchantPage = await merchantContext.newPage();
    const courierPage = await courierContext.newPage();
    const supportPage = await supportContext.newPage();

    try {
      const merchant = await createMerchant(merchantUser, emails.merchant);

      // 1. Le livreur s'inscrit seul, sans invitation d'aucune boutique.
      await courierPage.goto("/devenir-livreur");
      await courierPage.getByLabel("Nom et prénom").fill(`Livreur vivier ${runId}`);
      await courierPage.getByLabel("Téléphone").fill(courierPhone);
      await courierPage.getByLabel("Véhicule").selectOption("motorbike");
      await courierPage.getByLabel("Immatriculation").fill(`DK-${runId.slice(-4)}`);
      await activateButton(courierPage.getByRole("button", { name: "Continuer" }));

      await courierPage.getByLabel("Adresse email").fill(emails.courier);
      await courierPage.locator("#courier-password").fill(password);
      const signupResponse = courierPage.waitForResponse(
        (response) => response.url().endsWith("/api/livreur/inscription") && response.request().method() === "POST",
      );
      await activateButton(courierPage.getByRole("button", { name: "Créer mon compte livreur" }));
      expect((await signupResponse).status()).toBe(201);
      await expect(courierPage.getByRole("heading", { name: "Vos justificatifs" })).toBeVisible({ timeout: 20_000 });

      const { data: profile } = await admin
        .from("courier_profiles")
        .select("id, user_id, verification_status, phone")
        .eq("email", emails.courier)
        .single();
      expect(profile?.verification_status).toBe("pending_verification");
      expect(profile?.phone).toBe(courierPhone);
      created.courierIds.push(profile!.id);
      if (profile?.user_id) created.userIds.push(profile.user_id);

      const { data: verificationCase } = await admin
        .from("courier_verification_cases")
        .select("id")
        .eq("courier_id", profile!.id)
        .single();

      // 2. Il dépose sa pièce d'identité et sa carte grise, puis soumet.
      await signIn(courierContext, emails.courier);
      for (const documentType of ["national_id_front", "national_id_back", "vehicle_registration_document"]) {
        await uploadDocument(courierContext, verificationCase!.id, documentType);
      }
      await responseData(await courierContext.request.post(`/api/livreur/verifications/${verificationCase!.id}/submit`));
      await expect.poll(async () =>
        (await admin.from("courier_verification_cases").select("submitted_at").eq("id", verificationCase!.id).single()).data?.submitted_at,
      ).toBeTruthy();

      // 3. Tant qu'il n'est pas vérifié, il reste introuvable pour le commerçant.
      const beforeApproval = await responseData<{ courier: unknown; reason?: string }>(
        await merchantContext.request.get(`/api/merchant/couriers/lookup?merchantId=${merchant.id}&phone=${encodeURIComponent(courierPhone)}`),
      );
      expect(beforeApproval.courier).toBeNull();
      expect(beforeApproval.reason).toBe("not_verified");

      // 4. Le support valide le dossier depuis l'onglet « Dossiers livreurs ».
      await enableAdminMfa(supportPage);
      await supportPage.goto("/admin");
      await supportPage.locator("button").filter({ hasText: "Dossiers livreurs" }).click({ force: true, timeout: 15_000 });
      const courierRow = supportPage.locator(".admin-record-list button").filter({ hasText: `Livreur vivier ${runId}` });
      await activateButton(courierRow);
      await expect(supportPage.getByRole("button", { name: "Enregistrer la décision" })).toBeVisible({ timeout: 15_000 });
      await supportPage.getByLabel("Décision").selectOption("verified");
      await activateButton(supportPage.getByRole("button", { name: "Enregistrer la décision" }));
      await expect.poll(async () =>
        (await admin.from("courier_profiles").select("verification_status").eq("id", profile!.id).single()).data?.verification_status,
      ).toBe("verified");

      // 5. Le commerçant le trouve dans le vivier et l'invite.
      await merchantPage.goto("/marchand");
      await merchantPage.getByRole("button", { name: /^Livreurs/ }).click({ force: true });
      // L'écran livreurs a ses propres sous-onglets : la recherche vit dans « Livreurs ».
      await merchantPage.getByRole("tab", { name: /^Livreurs/ }).click({ force: true });
      const searchCard = merchantPage.locator("section.mvp-card").filter({ has: merchantPage.getByRole("heading", { name: "Inviter un livreur" }) });
      await searchCard.getByLabel("Téléphone du livreur").fill(courierPhone);
      await activateButton(searchCard.getByRole("button", { name: "Rechercher" }));
      await expect(searchCard.getByText(`Livreur vivier ${runId}`)).toBeVisible({ timeout: 15_000 });
      await activateButton(searchCard.getByRole("button", { name: "Inviter dans mon équipe" }));
      await expect.poll(async () =>
        (await admin.from("courier_memberships").select("status").eq("merchant_id", merchant.id).eq("courier_profile_id", profile!.id).maybeSingle()).data?.status,
      ).toBe("pending_invitation");

      // 6. Le livreur accepte l'invitation depuis son espace.
      await courierPage.goto("/marchand?mode=missions");
      const invitationRow = courierPage.locator(".mvp-row").filter({ hasText: merchant.public_name });
      await expect(invitationRow).toBeVisible({ timeout: 20_000 });
      await activateButton(invitationRow.getByRole("button", { name: "Accepter" }));
      await expect.poll(async () =>
        (await admin.from("courier_memberships").select("status").eq("merchant_id", merchant.id).eq("courier_profile_id", profile!.id).single()).data?.status,
      ).toBe("active");

      // 7. Il devient sélectionnable pour une affectation côté commerçant.
      const couriers = await responseData<{ items: Array<{ id: string; status: string; display_name: string }> }>(
        await merchantContext.request.get(`/api/merchant/couriers?merchantId=${merchant.id}`),
      );
      expect(couriers.items.some((item) => item.status === "active" && item.display_name.includes(runId))).toBe(true);
    } finally {
      await Promise.all([merchantContext.close(), courierContext.close(), supportContext.close()]);
    }
  });
});
