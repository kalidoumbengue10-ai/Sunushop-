import { expect, test, type APIResponse, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Les variables Supabase E2E sont absentes.");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const password = `SunuShop-Location-${crypto.randomUUID()}!`;
const created = { userIds: [] as string[], merchantIds: [] as string[] };

async function responseData<T>(response: APIResponse, status = 200) {
  const payload = await response.json().catch(() => null) as { data?: T; error?: unknown } | null;
  expect(response.status(), JSON.stringify(payload)).toBe(status);
  return payload?.data as T;
}

async function activate(button: Locator) {
  await button.focus({ timeout: 15_000 });
  await button.press("Enter", { timeout: 15_000 });
}

async function createUser(email: string, displayName: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, e2e_run_id: runId },
  });
  if (error || !data.user) throw error ?? new Error(`Utilisateur non cree : ${email}`);
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

async function createMerchant(ownerId: string, email: string) {
  const { data, error } = await admin.from("merchant_accounts").insert({
    owner_user_id: ownerId,
    kind: "informal",
    public_name: `Boutique localisation ${runId}`,
    slug: `boutique-localisation-${runId}`,
    description: "Boutique ephemere du test de localisation.",
    phone: "+221770005551",
    email,
    region: "Dakar",
    city: "Dakar",
    status: "active",
    verification_status: "approved",
    subscription_status: "active",
  }).select("id, public_name").single();
  if (error) throw error;
  created.merchantIds.push(data.id);
  const { error: memberError } = await admin.from("merchant_members").insert({ merchant_id: data.id, user_id: ownerId, role: "owner" });
  if (memberError) throw memberError;
  return data;
}

async function openLivraisonTab(page: Page) {
  await page.goto("/marchand");
  await page.getByRole("button", { name: "Livraison" }).click({ force: true });
  await expect(page.getByRole("heading", { name: "Adresse et localisation publique" })).toBeVisible();
}

async function cleanup() {
  for (const merchantId of created.merchantIds.reverse()) {
    await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: merchantId });
  }
  for (const userId of created.userIds.reverse()) await admin.auth.admin.deleteUser(userId);
}

test.describe.serial("localisation de la boutique marchande", () => {
  test.afterAll(cleanup);

  test("recherche, sélection sur carte et enregistrement de la position sont indépendants du retrait", async ({ browser }) => {
    test.setTimeout(120_000);
    const email = `location-merchant-${runId}@example.test`;
    const merchantUserId = await createUser(email, "Marchand localisation");

    const context = await browser.newContext();
    await signIn(context, email);
    const page = await context.newPage();

    try {
      const merchant = await createMerchant(merchantUserId, email);

      // La recherche d'adresse est mockée pour ne pas dépendre du quota
      // OpenRouteService réel et rester déterministe : on vérifie ici le
      // câblage recherche -> sélection -> état du formulaire, pas le
      // classement du moteur de geocoding tiers.
      await page.route("**/api/maps/search*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              items: [
                { label: "Marché Sandaga, Dakar", latitude: 14.6717, longitude: -17.4381 },
              ],
            },
            requestId: "test-search",
          }),
        });
      });
      await page.route("**/api/maps/reverse*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { place: null }, requestId: "test-reverse" }),
        });
      });

      const mapErrors: string[] = [];
      const isMapRelated = (text: string) => /tiles\.openfreemap|maplibre|MAPS_/i.test(text);
      page.on("console", (message) => {
        if (message.type() === "error" && isMapRelated(message.text())) mapErrors.push(`[console] ${message.text()}`);
      });
      page.on("pageerror", (error) => { if (isMapRelated(String(error))) mapErrors.push(`[pageerror] ${String(error)}`); });
      page.on("requestfailed", (request) => { if (isMapRelated(request.url())) mapErrors.push(`[requestfailed] ${request.url()} — ${request.failure()?.errorText}`); });
      page.on("response", (response) => { if (!response.ok() && isMapRelated(response.url())) mapErrors.push(`[http${response.status()}] ${response.url()}`); });

      // Preuve que le contenu vectoriel (routes, villes, frontières) se
      // charge réellement, pas seulement le fond raster basse résolution :
      // c'est précisément la régression que l'absence de message d'erreur
      // ne suffit pas à détecter (le worker MapLibre pouvait ne jamais se
      // créer sans qu'aucune erreur ne soit levée).
      let vectorTileRequested = false;
      page.on("request", (request) => {
        if (/tiles\.openfreemap\.org\/planet\/.+\.pbf/.test(request.url())) vectorTileRequested = true;
      });

      await openLivraisonTab(page);

      // Bug 1 : la carte doit se charger sans afficher le message de repli
      // (délai généreux : le rendu WebGL initial peut être lent hors GPU dédié).
      const mapUnavailableMessage = page.getByText("Le fond de carte ne répond pas");
      await expect(page.locator(".location-map").first()).toBeVisible();
      await page.waitForTimeout(16_000);
      if (await mapUnavailableMessage.count()) {
        throw new Error(`Carte indisponible. Erreurs liées à la carte : ${JSON.stringify(mapErrors, null, 2)}`);
      }
      expect(vectorTileRequested, "aucune tuile vectorielle (routes, villes, frontières) n'a été demandée : le worker MapLibre a probablement échoué silencieusement").toBe(true);

      // Bug 3 : la recherche renvoie un résultat exploitable et sélectionnable.
      const locationSection = page.locator("section.location-picker").filter({ hasText: "Position publique de la boutique" });
      await locationSection.getByLabel("Rechercher un lieu").fill("Marché Sandaga");
      const result = page.getByRole("button", { name: "Marché Sandaga, Dakar" });
      await expect(result).toBeVisible({ timeout: 10_000 });
      await activate(result);
      await expect(locationSection.getByText(/Point sélectionné/)).toContainText("14.671700, -17.438100");

      // Bug 2 : le bouton d'enregistrement de la position est directement
      // accessible sous la carte, sans dépendre des champs de retrait.
      const saveLocationButton = page.getByRole("button", { name: "Enregistrer la localisation" });
      await expect(saveLocationButton).toBeVisible();
      await activate(saveLocationButton);
      await expect(page.getByText("Localisation publique mise à jour.")).toBeVisible({ timeout: 10_000 });

      await expect.poll(async () => {
        const { data } = await admin.from("merchant_accounts").select("pickup_latitude, pickup_longitude").eq("id", merchant.id).single();
        return data;
      }).toMatchObject({ pickup_latitude: 14.6717, pickup_longitude: -17.4381 });

      // Le formulaire de retrait en boutique est bien un formulaire distinct
      // avec son propre bouton, qui ne réécrit pas la position déjà enregistrée.
      const pickupButton = page.getByRole("button", { name: "Enregistrer le retrait en boutique" });
      await expect(pickupButton).toBeVisible();
      await activate(pickupButton);
      await expect(page.getByText("Retrait en boutique mis à jour.")).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => {
        const { data } = await admin.from("merchant_accounts").select("pickup_latitude, pickup_longitude").eq("id", merchant.id).single();
        return data;
      }).toMatchObject({ pickup_latitude: 14.6717, pickup_longitude: -17.4381 });
    } finally {
      await context.close();
    }
  });
});
