import { expect, test, type APIResponse, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Les variables Supabase E2E sont absentes.");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const runId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const password = `SunuShop-Assign-${crypto.randomUUID()}!`;
const created = { userIds: [] as string[], merchantIds: [] as string[] };
type JsonObject = Record<string, unknown>;

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

async function createMerchant(ownerUserId: string, ownerEmail: string, suffix: string) {
  const { data, error } = await admin.from("merchant_accounts").insert({
    owner_user_id: ownerUserId, kind: "informal", public_name: `Boutique affectation ${suffix} ${runId}`,
    slug: `boutique-affectation-${suffix.toLowerCase()}-${runId}`, description: "Boutique éphémère du test d’affectation livreur.",
    phone: "+221770004444", email: ownerEmail, region: "Dakar", city: "Dakar",
    wave_payment_number: "+221770004444",
    address_hint: `Point de retrait ${suffix}`, pickup_address_line: `8 rue ${suffix}, Dakar`, pickup_latitude: 14.7167, pickup_longitude: -17.4677,
    pickup_instructions: `Demander le comptoir ${suffix}`, pickup_enabled: true, status: "active", verification_status: "approved", subscription_status: "active",
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

async function createCatalogAndZone(context: BrowserContext, merchantId: string, suffix: string, courierFeeXof = 1200) {
  const { data: category, error } = await admin.from("categories").select("id").eq("active", true).limit(1).single();
  if (error) throw error;
  const zone = await responseData<{ zoneId: string }>(await context.request.post("/api/merchant/delivery-zones", { data: {
    merchantId, methodKind: "merchant_delivery", methodName: `Livraison ${suffix}`, region: "Dakar", city: "Dakar",
    label: `Dakar ${suffix}`, feeXof: 1800, courierFeeXof, minDelayMinutes: 30, maxDelayMinutes: 180,
  } }), 201);
  const pickupZone = await responseData<{ zoneId: string }>(await context.request.post("/api/merchant/delivery-zones", { data: {
    merchantId, methodKind: "pickup", methodName: `Retrait ${suffix}`, region: "Dakar", city: "Dakar",
    label: `Retrait ${suffix}`, feeXof: 0, minDelayMinutes: 15, maxDelayMinutes: 60,
  } }), 201);
  const product = await responseData<{ variantId: string }>(await context.request.post("/api/merchant/products", { data: {
    merchantId, categoryId: category.id, title: `Colis ${suffix} ${runId}`, slug: `colis-affectation-${suffix.toLowerCase()}-${runId}`,
    description: "Produit créé uniquement pour le test Playwright d’affectation.", sku: `ASSIGN-${suffix}-${runId}`,
    variantTitle: "Standard", priceXof: 4500, stock: 20, publish: true,
  } }), 201);
  return { zoneId: zone.zoneId, pickupZoneId: pickupZone.zoneId, variantId: product.variantId };
}

async function prepareOrderUpTo(
  client: BrowserContext, merchant: BrowserContext, merchantId: string, zoneId: string, variantId: string, label: string,
  finalStatus: "pending_seller_confirmation" | "confirmed" | "preparing" | "ready_for_handoff",
) {
  const batch = await responseData<{ orders: Array<{ id: string; publicCode: string; totalXof: number }> }>(await client.request.post("/api/orders/batch", {
    headers: { "idempotency-key": `assign-${runId}-${label}` },
    data: { recipient: { name: `Client ${label}`, phone: "+221770005555", region: "Dakar", city: "Dakar", addressHint: `12 avenue Client ${label}`, latitude: 14.72, longitude: -17.45 }, groups: [{ merchantId, deliveryZoneId: zoneId, methodKind: "merchant_delivery", paymentMethod: "wave_direct", items: [{ variantId, quantity: 1 }] }] },
  }), 201);
  const order = batch.orders[0];
  const declaration = await responseData<{ id: string }>(await client.request.post(`/api/orders/${order.id}/payment-declarations`, { data: { channel: "wave", externalReference: `ORDER-ASSIGN-${runId}-${label}`, amountXof: order.totalXof, declaredAt: new Date().toISOString() } }), 201);
  await responseData(await merchant.request.patch(`/api/orders/${order.id}/payment-declarations`, { data: { declarationId: declaration.id, decision: "confirmed" } }));
  if (finalStatus === "pending_seller_confirmation") return order;
  const sequence = ["confirmed", "preparing", "ready_for_handoff"] as const;
  for (const status of sequence) {
    await responseData(await merchant.request.post(`/api/orders/${order.id}/status`, { data: { status, publicMessage: `Préparation ${label}` } }));
    if (status === finalStatus) break;
  }
  return order;
}

async function preparePickupOrder(client: BrowserContext, merchant: BrowserContext, merchantId: string, pickupZoneId: string, variantId: string, label: string) {
  const batch = await responseData<{ orders: Array<{ id: string; publicCode: string; totalXof: number }> }>(await client.request.post("/api/orders/batch", {
    headers: { "idempotency-key": `assign-pickup-${runId}-${label}` },
    data: { recipient: { name: `Client ${label}`, phone: "+221770005555", region: "Dakar", city: "Dakar", addressHint: `Retrait boutique ${label}` }, groups: [{ merchantId, deliveryZoneId: pickupZoneId, methodKind: "pickup", paymentMethod: "cash_on_delivery", items: [{ variantId, quantity: 1 }] }] },
  }), 201);
  const order = batch.orders[0];
  for (const status of ["confirmed", "preparing", "ready_for_handoff"] as const) {
    await responseData(await merchant.request.post(`/api/orders/${order.id}/status`, { data: { status, publicMessage: `Préparation ${label}` } }));
  }
  return order;
}

async function openCourierTab(page: Page) {
  await page.goto("/marchand");
  await page.getByRole("button", { name: /^Livreurs/ }).click({ force: true });
  await expect(page.getByRole("heading", { name: "Enregistrer un livreur" })).toBeVisible();
}

async function registerCourier(page: Page, merchantId: string, email: string, suffix: string) {
  await openCourierTab(page);
  const card = page.locator("section.mvp-card").filter({ has: page.getByRole("heading", { name: "Enregistrer un livreur" }) });
  await card.getByLabel("Nom complet").fill(`Livreur ${suffix}`);
  await card.getByLabel("Email").fill(email);
  await card.getByLabel("Téléphone").fill("+221770006666");
  await card.getByLabel("Véhicule").selectOption("motorbike");
  const registerResponse = page.waitForResponse((response) => response.url().endsWith("/api/merchant/couriers") && response.request().method() === "POST");
  const button = card.getByRole("button", { name: "Enregistrer le livreur" });
  await button.focus();
  await button.press("Enter");
  const rawResponse = await registerResponse;
  expect(rawResponse.status()).toBe(201);
  const payload = (await rawResponse.json()) as { data: { membershipId: string } };
  await expect(page.getByRole("status")).toContainText("Livreur enregistré", { timeout: 15_000 });
  await expect.poll(async () => (await admin.from("courier_memberships").select("courier_user_id").eq("id", payload.data.membershipId).single()).data?.courier_user_id).toBeNull();
  return payload.data.membershipId;
}

async function assignmentForm(page: Page) {
  return page.locator("section.mvp-card").filter({ has: page.getByRole("heading", { name: "Affecter une commande prête" }) });
}

async function cleanup() {
  for (const merchantId of created.merchantIds.reverse()) await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: merchantId });
  for (const userId of created.userIds.reverse()) await admin.auth.admin.deleteUser(userId);
}

test.describe.serial("affectation livreur : commandes visibles et enregistrement direct", () => {
  test.afterAll(cleanup);

  test("un livreur enregistré directement est sélectionnable et les commandes éligibles s’affichent correctement", async ({ browser }) => {
    test.setTimeout(600_000);
    const emails = {
      merchant: `assign-merchant-${runId}@example.test`,
      client: `assign-client-${runId}@example.test`,
      courier: `assign-courier-${runId}@example.test`,
    };
    const [merchantUser, clientUser] = await Promise.all([
      createUser(emails.merchant, "Marchand affectation"),
      createUser(emails.client, "Client affectation"),
    ]);
    expect(merchantUser).toBeTruthy(); expect(clientUser).toBeTruthy();

    const merchantContext = await browser.newContext();
    const clientContext = await browser.newContext();
    await Promise.all([signIn(merchantContext, emails.merchant), signIn(clientContext, emails.client)]);
    const merchantPage = await merchantContext.newPage();

    try {
      const merchant = await createMerchant(merchantUser, emails.merchant, "M");
      const catalog = await createCatalogAndZone(merchantContext, merchant.id, "M");

      // Scénario 6 : état vide avant toute commande éligible.
      await openCourierTab(merchantPage);
      await expect(merchantPage.getByText("Aucune commande à affecter.")).toBeVisible();

      // Scénario 1 : enregistrement direct, sans claim, le livreur devient sélectionnable.
      const membershipId = await registerCourier(merchantPage, merchant.id, emails.courier, "M");
      const form = await assignmentForm(merchantPage);
      await expect(form.locator(`select[name="courierMembershipId"] option[value="${membershipId}"]`)).toBeAttached({ timeout: 15_000 });

      const [pendingOrder, confirmedOrder, preparingOrder, readyOrder, pickupOrder] = await Promise.all([
        prepareOrderUpTo(clientContext, merchantContext, merchant.id, catalog.zoneId, catalog.variantId, "pending", "pending_seller_confirmation"),
        prepareOrderUpTo(clientContext, merchantContext, merchant.id, catalog.zoneId, catalog.variantId, "confirmed", "confirmed"),
        prepareOrderUpTo(clientContext, merchantContext, merchant.id, catalog.zoneId, catalog.variantId, "preparing", "preparing"),
        prepareOrderUpTo(clientContext, merchantContext, merchant.id, catalog.zoneId, catalog.variantId, "ready", "ready_for_handoff"),
        preparePickupOrder(clientContext, merchantContext, merchant.id, catalog.pickupZoneId, catalog.variantId, "pickup"),
      ]);

      await merchantPage.reload();
      await openCourierTab(merchantPage);
      const populatedForm = await assignmentForm(merchantPage);

      // Scénario 3 : commandes payées en attente/confirmed/preparing visibles mais désactivées, ready_for_handoff activable.
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${pendingOrder.id}"]`)).toContainText("à confirmer");
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${pendingOrder.id}"]`)).toHaveAttribute("disabled", "");
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${confirmedOrder.id}"]`)).toBeAttached({ timeout: 15_000 });
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${confirmedOrder.id}"]`)).toContainText("à préparer");
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${confirmedOrder.id}"]`)).toHaveAttribute("disabled", "");
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${preparingOrder.id}"]`)).toContainText("à préparer");
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${preparingOrder.id}"]`)).toHaveAttribute("disabled", "");
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${readyOrder.id}"]`)).toContainText("prête");
      await expect(populatedForm.locator(`select[name="orderId"] option[value="${readyOrder.id}"]`)).not.toHaveAttribute("disabled", "");

      // Scénario 4 : la commande de retrait boutique est absente du sélecteur.
      await expect(populatedForm.locator('select[name="orderId"]')).not.toContainText(pickupOrder.publicCode);

      // Scénario 2 : affectation immédiate à un livreur non activé.
      await populatedForm.locator('select[name="orderId"]').selectOption(readyOrder.id);
      await populatedForm.locator('select[name="courierMembershipId"]').selectOption(membershipId);
      await activateButton(populatedForm.getByRole("button", { name: "Affecter" }));
      await expect(merchantPage.getByRole("status")).toContainText("Livraison affectée");
      await expect.poll(async () => (await admin.from("deliveries").select("courier_membership_id").eq("order_id", readyOrder.id).single()).data?.courier_membership_id).toBe(membershipId);

      // Scénario 5 : une fois assignée puis en trajet, la commande n’est plus proposée.
      const { data: delivery } = await admin.from("deliveries").select("id").eq("order_id", readyOrder.id).single();
      await admin.from("deliveries").update({ status: "in_transit" }).eq("id", delivery!.id);
      await merchantPage.reload();
      await openCourierTab(merchantPage);
      const lockedForm = await assignmentForm(merchantPage);
      await expect(lockedForm.locator('select[name="orderId"]')).not.toContainText(readyOrder.publicCode);

      // Scénario 9 : ré-enregistrer le même email met à jour la fiche sans créer de doublon.
      const card = merchantPage.locator("section.mvp-card").filter({ has: merchantPage.getByRole("heading", { name: "Enregistrer un livreur" }) });
      await card.getByLabel("Nom complet").fill("Livreur M mis à jour");
      await card.getByLabel("Email").fill(emails.courier);
      await card.getByLabel("Téléphone").fill("+221770007777");
      const secondRegisterResponse = merchantPage.waitForResponse((response) => response.url().endsWith("/api/merchant/couriers") && response.request().method() === "POST");
      const secondButton = card.getByRole("button", { name: "Enregistrer le livreur" });
      await secondButton.focus();
      await secondButton.press("Enter");
      expect((await secondRegisterResponse).status()).toBe(201);
      const { data: membershipsForEmail } = await admin.from("courier_memberships").select("id, display_name").eq("merchant_id", merchant.id).eq("email", emails.courier);
      expect(membershipsForEmail).toHaveLength(1);
      expect(membershipsForEmail?.[0]?.display_name).toBe("Livreur M mis à jour");

      // Scénario 7 : activation ultérieure fusionne sur la fiche existante sans dupliquer, et préserve le profil.
      const { data: invitation } = await admin.from("workspace_invitations").select("id").eq("merchant_id", merchant.id).eq("email", emails.courier).eq("kind", "courier").eq("status", "pending").order("created_at", { ascending: false }).limit(1).single();
      const { data: outbox, error: outboxError } = await admin.from("notification_outbox").select("payload").eq("dedupe_key", `courier-invitation:${invitation!.id}`).single();
      if (outboxError) throw outboxError;
      const notification = outbox.payload as JsonObject;
      const invitationUrl = new URL(String(notification.url));
      const next = invitationUrl.searchParams.get("next") ?? `${invitationUrl.pathname}${invitationUrl.search}`;

      const courierUserId = await createUser(emails.courier, "Livreur M");
      const courierContext = await browser.newContext();
      await signIn(courierContext, emails.courier);
      const courierPage = await courierContext.newPage();
      await courierPage.goto(next);
      await expect(courierPage.getByText("Votre accès livreur est actif.")).toBeVisible({ timeout: 20_000 });
      await courierPage.close();
      await courierContext.close();

      await expect.poll(async () => {
        const { data } = await admin.from("courier_memberships").select("id").eq("merchant_id", merchant.id).eq("email", emails.courier);
        return data?.length ?? 0;
      }).toBe(1);
      const { data: mergedMembership } = await admin.from("courier_memberships").select("id, courier_user_id, display_name").eq("merchant_id", merchant.id).eq("email", emails.courier).single();
      expect(mergedMembership).toMatchObject({ id: membershipId, courier_user_id: courierUserId, display_name: "Livreur M mis à jour" });
    } finally {
      await Promise.all([merchantContext.close(), clientContext.close()]);
    }
  });
});
