import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const password = `SunuShop-E2E-${crypto.randomUUID()}!`;
const cronSecret = process.env.CRON_SECRET ?? "e2e-local-cron-secret-32-characters";
const clientEmail = `relations-client-${runId}@example.test`;
const merchantEmail = `relations-merchant-${runId}@example.test`;
const createdUserIds: string[] = [];
const createdMerchantIds: string[] = [];

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function createUser(email: string, name: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name, e2e_run_id: runId } });
  if (error || !data.user) throw error ?? new Error("Utilisateur E2E non créé");
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function createMerchant(ownerUserId: string, suffix: string) {
  const slug = `relations-${suffix.toLowerCase()}-${runId}`;
  const { data, error } = await admin.from("merchant_accounts").insert({
    owner_user_id: ownerUserId,
    kind: "informal",
    public_name: `Boutique ${suffix} ${runId}`,
    slug,
    description: "Fixture temporaire des suivis et favoris.",
    phone: `+22177000${String(createdMerchantIds.length + 10).padStart(4, "0")}`,
    email: merchantEmail,
    region: "Dakar",
    city: "Dakar",
    pickup_enabled: true,
    pickup_address_line: "Point de retrait E2E, Dakar",
    pickup_latitude: 14.7167,
    pickup_longitude: -17.4677,
    status: "active",
    verification_status: "approved",
    subscription_status: "active",
  }).select("id, public_name, slug").single();
  if (error) throw error;
  createdMerchantIds.push(data.id);
  const periodEnd = new Date(Date.now() + 30 * 86_400_000);
  const { error: subscriptionError } = await admin.from("merchant_subscriptions").insert({
    merchant_id: data.id,
    plan_id: "essential",
    status: "active",
    starts_at: new Date().toISOString(),
    current_period_ends_at: periodEnd.toISOString(),
    grace_ends_at: new Date(periodEnd.getTime() + 3 * 86_400_000).toISOString(),
  });
  if (subscriptionError) throw subscriptionError;
  return data;
}

async function signIn(context: BrowserContext, email: string) {
  const response = await context.request.post("/api/auth/password/sign-in", { data: { email, password } });
  expect(response.status(), await response.text()).toBe(200);
}

function failOnBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|AbortError|aborted/i.test(message.text())) errors.push(`console: ${message.text()}`);
  });
  return () => expect(errors, errors.join("\n")).toEqual([]);
}

async function cleanup() {
  const { data: media } = createdMerchantIds.length
    ? await admin.from("merchant_media").select("storage_path").in("merchant_id", createdMerchantIds)
    : { data: [] };
  if (media?.length) await admin.storage.from("merchant-branding").remove(media.map((item) => item.storage_path));
  if (createdMerchantIds.length) await admin.from("merchant_accounts").delete().in("id", createdMerchantIds);
  for (const userId of createdUserIds.reverse()) await admin.auth.admin.deleteUser(userId);
}

test.describe.serial("suivis, favoris, visuels et digest", () => {
  test.afterAll(cleanup);

  test("sépare les relations, propage les médias et regroupe les e-mails", async ({ browser, request }) => {
    test.setTimeout(300_000);
    const merchantUserId = await createUser(merchantEmail, "Marchand Relations E2E");
    await createUser(clientEmail, "Client Relations E2E");
    const shops = await Promise.all([
      createMerchant(merchantUserId, "A"),
      createMerchant(merchantUserId, "B"),
      createMerchant(merchantUserId, "C"),
    ]);
    const { error: memberError } = await admin.from("merchant_members").insert({ merchant_id: shops[0].id, user_id: merchantUserId, role: "owner" });
    if (memberError) throw memberError;

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/boutiques/${shops[0].slug}`);
    const guestFollow = guestPage.getByRole("link", { name: "Se connecter pour suivre cette boutique" });
    await expect(guestFollow).toHaveAttribute("href", new RegExp(`next=.*boutiques.*${shops[0].slug}`));
    const loginHref = await guestFollow.getAttribute("href");
    await guestPage.goto(loginHref!);
    await expect(guestPage).toHaveURL(/\/connexion\?.*next=.*boutiques/);
    await guestContext.close();

    const merchantContext = await browser.newContext();
    await signIn(merchantContext, merchantEmail);
    const merchantPage = await merchantContext.newPage();
    const assertMerchantErrors = failOnBrowserErrors(merchantPage);
    await merchantPage.goto("/marchand");
    await merchantPage.getByRole("button", { name: /Ma boutique/ }).click();
    const mediaInput = merchantPage.locator('input[name="file"]');
    await mediaInput.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await expect(merchantPage.getByAltText("Prévisualisation du logo")).toBeVisible();
    await merchantPage.getByRole("button", { name: "Enregistrer l’image" }).click();
    await expect(merchantPage.getByText("Le logo de votre boutique a été mis à jour.")).toBeVisible({ timeout: 30_000 });
    const firstLogoUrl = await merchantPage.getByAltText("Logo actuel de la boutique").getAttribute("src");

    await merchantPage.getByLabel("Type d’image").selectOption("cover");
    await mediaInput.setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
    await expect(merchantPage.getByAltText("Prévisualisation de la couverture")).toBeVisible();
    await merchantPage.getByRole("button", { name: "Enregistrer l’image" }).click();
    await expect(merchantPage.getByAltText("Couverture actuelle de la boutique")).toBeVisible({ timeout: 30_000 });

    await merchantPage.getByLabel("Type d’image").selectOption("logo");
    await mediaInput.setInputFiles({ name: "logo-remplace.png", mimeType: "image/png", buffer: png });
    await merchantPage.getByRole("button", { name: "Enregistrer l’image" }).click();
    await expect.poll(() => merchantPage.getByAltText("Logo actuel de la boutique").getAttribute("src")).not.toBe(firstLogoUrl);
    assertMerchantErrors();
    await merchantContext.close();

    const clientContext = await browser.newContext();
    await signIn(clientContext, clientEmail);
    const page = await clientContext.newPage();
    const assertClientErrors = failOnBrowserErrors(page);
    await page.goto(`/boutiques/${shops[0].slug}`);
    const follow = page.getByRole("button", { name: "Suivre cette boutique" });
    const favorite = page.getByRole("button", { name: "Ajouter aux favoris" });
    await expect(follow).toBeEnabled({ timeout: 30_000 });
    await follow.click();
    await expect(page.getByRole("button", { name: "Boutique suivie" })).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
    await expect(favorite).toBeEnabled({ timeout: 30_000 });
    await favorite.click();
    await expect(page.getByRole("button", { name: "Dans mes favoris" })).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Boutique suivie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dans mes favoris" })).toBeVisible();

    await page.getByRole("button", { name: "Dans mes favoris" }).click();
    await expect(page.getByRole("button", { name: "Boutique suivie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter aux favoris" })).toBeVisible();
    await page.getByRole("button", { name: "Ajouter aux favoris" }).click();

    await clientContext.request.post("/api/client/shop-favorites", { data: { merchantId: shops[1].id } });
    await clientContext.request.post("/api/client/shop-follows", { data: { merchantId: shops[1].id } });
    await clientContext.request.post("/api/client/shop-favorites", { data: { merchantId: shops[2].id } });
    await page.goto("/client");
    await expect(page.getByRole("heading", { name: "Mes favoris" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Boutiques suivies" })).toBeVisible();
    await expect(page.getByAltText(new RegExp(`Logo ${shops[0].public_name}`)).first()).toBeVisible();

    await page.goto(`/recherche?q=${encodeURIComponent(shops[0].public_name)}`);
    await page.getByRole("tab", { name: /Boutiques/ }).click({ timeout: 30_000 });
    await expect(page.getByAltText(new RegExp(`Logo ${shops[0].public_name}`))).toBeVisible();
    await expect(page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth + 1)).resolves.toBe(true);

    const { data: category, error: categoryError } = await admin.from("categories").select("id").eq("active", true).limit(1).single();
    if (categoryError) throw categoryError;
    const productRows = [
      { merchant_id: shops[0].id, category_id: category.id, slug: `digest-a1-${runId}`, title: "Nouveauté A1", description: "Digest", status: "published" },
      { merchant_id: shops[0].id, category_id: category.id, slug: `digest-a2-${runId}`, title: "Nouveauté A2", description: "Digest", status: "published" },
      { merchant_id: shops[1].id, category_id: category.id, slug: `digest-b1-${runId}`, title: "Nouveauté B1", description: "Digest", status: "published" },
      { merchant_id: shops[2].id, category_id: category.id, slug: `digest-c1-${runId}`, title: "Nouveauté C1", description: "Digest", status: "published" },
    ];
    const { data: products, error: productError } = await admin.from("products").insert(productRows).select("id, merchant_id, title");
    if (productError) throw productError;
    await admin.from("products").update({ title: "Nouveauté A1 corrigée", status: "published" }).eq("id", products![0].id);

    // C1 est publié quand C est seulement favorite : aucune notification. Une
    // nouvelle publication après suivi crée un digest, ensuite supprimé avant le cron.
    const { count: favoriteOnlyDigests } = await admin.from("notification_outbox").select("id", { count: "exact", head: true }).eq("template", "shop_product_digest").contains("payload", { merchantId: shops[2].id });
    expect(favoriteOnlyDigests).toBe(0);
    await clientContext.request.post("/api/client/shop-follows", { data: { merchantId: shops[2].id } });
    const { error: unsubscribeProductError } = await admin.from("products").insert({ merchant_id: shops[2].id, category_id: category.id, slug: `digest-c2-${runId}`, title: "Nouveauté C2", description: "Digest", status: "published" });
    if (unsubscribeProductError) throw unsubscribeProductError;
    await clientContext.request.delete("/api/client/shop-follows", { data: { merchantId: shops[2].id } });
    const { data: activeFollows } = await admin.from("shop_follows").select("id").in("merchant_id", [shops[0].id, shops[1].id]);
    const prefixes = (activeFollows ?? []).map((item) => `shop-follow-digest:${item.id}:%`);
    for (const prefix of prefixes) await admin.from("notification_outbox").update({ available_at: new Date(Date.now() - 1_000).toISOString() }).like("dedupe_key", prefix);
    await request.delete("http://127.0.0.1:3110/messages");
    let digests: Array<{ to: string[]; subject: string; html: string }> = [];
    // Le worker traite volontairement dix e-mails par lot. La suite complète
    // peut laisser devant nous les notifications d'autres scénarios.
    for (let cycle = 0; cycle < 10 && digests.length < 2; cycle += 1) {
      const cron = await clientContext.request.get("/api/cron/notifications", { headers: { authorization: `Bearer ${cronSecret}` } });
      expect(cron.status(), await cron.text()).toBe(200);
      const mock = await (await request.get("http://127.0.0.1:3110/messages")).json() as { messages: Array<{ to: string[]; subject: string; html: string }> };
      digests = mock.messages.filter((message) => message.to.includes(clientEmail));
    }
    expect(digests).toHaveLength(2);
    expect(digests.find((message) => message.subject.includes(shops[0].public_name))?.html).toContain("Nouveauté A1");
    expect(digests.find((message) => message.subject.includes(shops[0].public_name))?.html).toContain("Nouveauté A2");
    expect(digests.some((message) => message.subject.includes(shops[2].public_name))).toBe(false);

    const invalidJson = await clientContext.request.post(`/api/orders/${crypto.randomUUID()}/payment-declarations`, { data: undefined, headers: { "content-type": "application/json" } });
    expect(invalidJson.status()).toBe(400);
    expect((await invalidJson.json()).error.code).toBe("INVALID_JSON");
    assertClientErrors();
    await clientContext.close();

    const freshContext = await browser.newContext();
    await signIn(freshContext, clientEmail);
    const freshPage = await freshContext.newPage();
    await freshPage.goto(`/boutiques/${shops[0].slug}`);
    await expect(freshPage.getByRole("button", { name: "Boutique suivie" })).toBeVisible();
    await expect(freshPage.getByRole("button", { name: "Dans mes favoris" })).toBeVisible();
    await freshContext.close();
  });
});
