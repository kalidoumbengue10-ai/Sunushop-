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
const password = `SunuShop-Courier-${crypto.randomUUID()}!`;
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

async function selectCheckbox(checkbox: Locator) {
  if (!(await checkbox.isChecked())) {
    await checkbox.focus();
    await checkbox.press("Space");
  }
  await expect(checkbox).toBeChecked();
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

async function createMerchant(ownerUserId: string, ownerEmail: string, suffix: string) {
  const { data, error } = await admin.from("merchant_accounts").insert({
    owner_user_id: ownerUserId, kind: "informal", public_name: `Boutique livreur ${suffix} ${runId}`,
    slug: `boutique-livreur-${suffix.toLowerCase()}-${runId}`, description: "Boutique éphémère du test livreur.",
    phone: "+221770001111", email: ownerEmail, region: "Dakar", city: "Dakar",
    wave_payment_number: "+221770001111",
    address_hint: `Point de retrait ${suffix}`, pickup_address_line: `12 rue ${suffix}, Dakar`, pickup_latitude: 14.7167, pickup_longitude: -17.4677,
    pickup_instructions: `Demander le comptoir ${suffix}`, status: "active", verification_status: "approved", subscription_status: "active",
  }).select("id, public_name").single();
  if (error) throw error;
  created.merchantIds.push(data.id);
  const { error: memberError } = await admin.from("merchant_members").insert({ merchant_id: data.id, user_id: ownerUserId, role: "owner" });
  if (memberError) throw memberError;
  return data;
}

async function createCatalogAndZone(context: BrowserContext, merchantId: string, suffix: string, courierFeeXof?: number) {
  const { data: category, error } = await admin.from("categories").select("id").eq("active", true).limit(1).single();
  if (error) throw error;
  const zone = await responseData<{ zoneId: string }>(await context.request.post("/api/merchant/delivery-zones", { data: {
    merchantId, methodKind: "merchant_delivery", methodName: `Livraison ${suffix}`, region: "Dakar", city: "Dakar",
    label: `Dakar ${suffix}`, feeXof: 1800, ...(courierFeeXof === undefined ? {} : { courierFeeXof }), minDelayMinutes: 30, maxDelayMinutes: 180,
  } }), 201);
  const product = await responseData<{ variantId: string }>(await context.request.post("/api/merchant/products", { data: {
    merchantId, categoryId: category.id, title: `Colis ${suffix} ${runId}`, slug: `colis-${suffix.toLowerCase()}-${runId}`,
    description: "Produit créé uniquement pour le flux de livraison Playwright.", sku: `COURIER-${suffix}-${runId}`,
    variantTitle: "Standard", priceXof: 4500, stock: 20, publish: true,
  } }), 201);
  return { zoneId: zone.zoneId, variantId: product.variantId, productTitle: `Colis ${suffix} ${runId}` };
}

async function prepareOrder(client: BrowserContext, merchant: BrowserContext, merchantId: string, zoneId: string, variantId: string, label: string) {
  const batch = await responseData<{ orders: Array<{ id: string; publicCode: string; totalXof: number }> }>(await client.request.post("/api/orders/batch", {
    headers: { "idempotency-key": `courier-${runId}-${label}` },
    data: { recipient: { name: `Client ${label}`, phone: "+221770002222", region: "Dakar", city: "Dakar", addressHint: `45 avenue Client ${label}`, latitude: 14.72, longitude: -17.45 }, groups: [{ merchantId, deliveryZoneId: zoneId, methodKind: "merchant_delivery", paymentMethod: "wave_direct", items: [{ variantId, quantity: 2 }] }] },
  }), 201);
  const order = batch.orders[0];
  const declaration = await responseData<{ id: string }>(await client.request.post(`/api/orders/${order.id}/payment-declarations`, { data: { channel: "wave", externalReference: `ORDER-${runId}-${label}`, amountXof: order.totalXof, declaredAt: new Date().toISOString() } }), 201);
  await responseData(await merchant.request.patch(`/api/orders/${order.id}/payment-declarations`, { data: { declarationId: declaration.id, decision: "confirmed" } }));
  for (const status of ["confirmed", "preparing", "ready_for_handoff"] as const) {
    await responseData(await merchant.request.post(`/api/orders/${order.id}/status`, { data: { status, publicMessage: `Préparation ${label}` } }));
  }
  return order;
}

async function openCourierTab(page: Page) {
  await page.goto("/marchand");
  await page.getByRole("button", { name: /^Livreurs/ }).click({ force: true });
  await expect(page.getByRole("heading", { name: "Inviter un livreur" })).toBeVisible();
}

async function inviteCourier(page: Page, merchantId: string, email: string, suffix: string) {
  await openCourierTab(page);
  const card = page.locator("section.mvp-card").filter({ has: page.getByRole("heading", { name: "Inviter un livreur" }) });
  await card.getByLabel("Nom complet").fill(`Livreur ${suffix}`);
  await card.getByLabel("Email").fill(email);
  await card.getByLabel("Téléphone").fill("+221770003333");
  await card.getByLabel("Véhicule").selectOption("motorbike");
  await card.getByLabel("Immatriculation").fill(`DK-${suffix}-${runId.slice(-4)}`);
  const invitationResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/merchant/couriers") && response.request().method() === "POST",
  );
  const invitationButton = card.getByRole("button", { name: "Envoyer l’invitation" });
  await invitationButton.focus();
  await invitationButton.press("Enter");
  expect((await invitationResponse).status()).toBe(201);
  await expect(page.getByRole("status")).toContainText("Invitation livreur envoyée", { timeout: 15_000 });
  await expect.poll(async () => (await admin.from("workspace_invitations").select("id").eq("merchant_id", merchantId).eq("email", email).eq("kind", "courier").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.id).toBeTruthy();
  const { data: invitation } = await admin.from("workspace_invitations").select("id").eq("merchant_id", merchantId).eq("email", email).eq("kind", "courier").order("created_at", { ascending: false }).limit(1).single();
  if (!invitation) throw new Error("Invitation livreur introuvable dans l’outbox.");
  const { data: outbox, error: outboxError } = await admin.from("notification_outbox").select("payload").eq("dedupe_key", `courier-invitation:${invitation.id}`).single();
  if (outboxError) throw outboxError;
  const notification = outbox.payload as JsonObject;
  return String(notification.url);
}

async function claimInvitation(context: BrowserContext, invitationUrl: string) {
  const url = new URL(invitationUrl);
  const next = url.searchParams.get("next") ?? `${url.pathname}${url.search}`;
  const page = await context.newPage();
  await page.goto(next);
  await expect(page.getByText("Votre accès livreur est actif.")).toBeVisible();
  await page.close();
}

async function assignmentForm(page: Page) {
  return page.locator("section.mvp-card").filter({ has: page.getByRole("heading", { name: "Affecter une commande prête" }) });
}

async function assignViaUi(page: Page, orderId: string, membershipId: string) {
  await openCourierTab(page);
  const form = await assignmentForm(page);
  await form.locator('select[name="orderId"]').selectOption(orderId);
  await form.locator('select[name="courierMembershipId"]').selectOption(membershipId);
  await activateButton(form.getByRole("button", { name: "Affecter" }));
  await expect(page.getByRole("status")).toContainText("Livraison affectée");
}

async function completeMission(options: {
  courierPage: Page; merchantPage: Page; clientContext: BrowserContext; order: { id: string; publicCode: string };
  deliveryId: string; fail?: boolean;
}) {
  const { courierPage, merchantPage, clientContext, order, deliveryId, fail } = options;
  await courierPage.goto("/marchand?mode=missions");
  let mission = courierPage.locator("article.courier-mission").filter({ hasText: order.publicCode });
  await activateButton(mission.getByRole("button", { name: "Accepter la mission" }));
  await activateButton(mission.getByRole("button", { name: "Je suis au commerce" }));
  const pickupCode = (await mission.locator(".courier-pickup-code strong").textContent())?.trim() ?? "";
  expect(pickupCode).toMatch(/^\d{6}$/);

  await merchantPage.goto("/marchand");
  await merchantPage.getByRole("button", { name: /^Livreurs/ }).click({ force: true });
  const merchantMission = merchantPage.locator("article.courier-delivery-row").filter({ hasText: order.publicCode });
  await merchantMission.locator('input[name="code"]').fill(pickupCode);
  await activateButton(merchantMission.getByRole("button", { name: "Autoriser le retrait" }));
  await expect(merchantPage.getByRole("status")).toContainText("Retrait confirmé");
  const afterPickup = await responseData<{ items: Array<{ id: string; pickupCode: string | null }> }>(await courierPage.context().request.get("/api/deliveries/mine"));
  expect(afterPickup.items.find((item) => item.id === deliveryId)?.pickupCode).toBeNull();

  await courierPage.reload();
  await activateButton(courierPage.getByRole("button", { name: "En cours", exact: true }));
  mission = courierPage.locator("article.courier-mission").filter({ hasText: order.publicCode });
  if (fail) {
    courierPage.once("dialog", (dialog) => dialog.accept("Client absent après plusieurs appels"));
    await activateButton(mission.getByRole("button", { name: "Signaler un échec" }));
    await expect.poll(async () => (await admin.from("deliveries").select("status").eq("id", deliveryId).single()).data?.status).toBe("failed");
    return;
  }
  await activateButton(mission.getByRole("button", { name: "Démarrer le trajet" }));
  const clientOrder = await responseData<{ delivery: { recipientCode: string } }>(await clientContext.request.get(`/api/orders/${order.id}`));
  expect(clientOrder.delivery.recipientCode).toMatch(/^\d{6}$/);
  await mission.locator('input[name="code"]').fill(clientOrder.delivery.recipientCode);
  await activateButton(mission.getByRole("button", { name: "Confirmer la remise" }));
  await expect.poll(async () => (await admin.from("deliveries").select("status").eq("id", deliveryId).single()).data?.status).toBe("delivered");
}

async function cleanup() {
  for (const merchantId of created.merchantIds.reverse()) await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: merchantId });
  for (const userId of created.userIds.reverse()) await admin.auth.admin.deleteUser(userId);
}

test.describe.serial("flux livreur complet", () => {
  test.afterAll(cleanup);

  test("invitation, codes, statistiques, rémunération, paiements, litige et isolation", async ({ browser }) => {
    test.setTimeout(600_000);
    const emails = {
      merchantA: `courier-merchant-a-${runId}@example.test`, merchantB: `courier-merchant-b-${runId}@example.test`,
      client: `courier-client-${runId}@example.test`, courier: `courier-main-${runId}@example.test`, outsider: `courier-outsider-${runId}@example.test`,
      support: `courier-support-${runId}@example.test`,
    };
    const [merchantAUser, merchantBUser, clientUser, courierUser, outsiderUser] = await Promise.all([
      createUser(emails.merchantA, "Marchand A"), createUser(emails.merchantB, "Marchand B"),
      createUser(emails.client, "Client livraison"), createUser(emails.courier, "Livreur principal"), createUser(emails.outsider, "Livreur extérieur"),
    ]);
    const supportUser = await createUser(emails.support, "Support livraison");
    expect(clientUser).toBeTruthy(); expect(courierUser).toBeTruthy(); expect(outsiderUser).toBeTruthy();
    const { error: supportRoleError } = await admin.from("admin_roles").insert({ user_id: supportUser, role: "support" });
    if (supportRoleError) throw supportRoleError;

    const merchantAContext = await browser.newContext(); const merchantBContext = await browser.newContext();
    const clientContext = await browser.newContext(); const courierContext = await browser.newContext(); const outsiderContext = await browser.newContext(); const supportContext = await browser.newContext();
    await Promise.all([signIn(merchantAContext, emails.merchantA), signIn(merchantBContext, emails.merchantB), signIn(clientContext, emails.client), signIn(courierContext, emails.courier), signIn(outsiderContext, emails.outsider), signIn(supportContext, emails.support)]);
    const merchantAPage = await merchantAContext.newPage(); const merchantBPage = await merchantBContext.newPage(); const courierPage = await courierContext.newPage(); const supportPage = await supportContext.newPage();

    try {
      const merchantA = await createMerchant(merchantAUser, emails.merchantA, "A");
      const merchantB = await createMerchant(merchantBUser, emails.merchantB, "B");
      const catalogA = await createCatalogAndZone(merchantAContext, merchantA.id, "A");
      const catalogB = await createCatalogAndZone(merchantBContext, merchantB.id, "B", 900);
      const [orderA1, orderA2, orderA3, orderB1] = await Promise.all([
        prepareOrder(clientContext, merchantAContext, merchantA.id, catalogA.zoneId, catalogA.variantId, "A1"),
        prepareOrder(clientContext, merchantAContext, merchantA.id, catalogA.zoneId, catalogA.variantId, "A2"),
        prepareOrder(clientContext, merchantAContext, merchantA.id, catalogA.zoneId, catalogA.variantId, "A3"),
        prepareOrder(clientContext, merchantBContext, merchantB.id, catalogB.zoneId, catalogB.variantId, "B1"),
      ]);

      const invitationA = await inviteCourier(merchantAPage, merchantA.id, emails.courier, "A");
      await claimInvitation(courierContext, invitationA);
      const { data: membershipA } = await admin.from("courier_memberships").select("id").eq("merchant_id", merchantA.id).eq("courier_user_id", courierUser).single();

      await openCourierTab(merchantAPage);
      const blockedForm = await assignmentForm(merchantAPage);
      await blockedForm.locator('select[name="orderId"]').selectOption(orderA1.id);
      await blockedForm.locator('select[name="courierMembershipId"]').selectOption(membershipA!.id);
      await activateButton(blockedForm.getByRole("button", { name: "Affecter" }));
      await expect(merchantAPage.locator(".mvp-alert--error")).toContainText("rémunération du livreur");

      await merchantAPage.getByRole("button", { name: /^Livraison/ }).click({ force: true });
      await activateButton(merchantAPage.getByRole("button", { name: "Modifier les tarifs" }));
      await merchantAPage.getByLabel("Rémunération du livreur (FCFA)").fill("1200");
      await activateButton(merchantAPage.getByRole("button", { name: "Enregistrer Dakar" }));
      await expect(merchantAPage.getByRole("status")).toContainText("Tarifs de Dakar enregistrés");

      await assignViaUi(merchantAPage, orderA1.id, membershipA!.id);
      const { data: deliveryA1 } = await admin.from("deliveries").select("id").eq("order_id", orderA1.id).single();
      const firstCourierPayload = await responseData<{ items: Array<{ publicCode: string; merchantSequence: number; orderItems: unknown[]; pickup_snapshot: JsonObject; recipient: JsonObject }> }>(await courierContext.request.get("/api/deliveries/mine"));
      expect(firstCourierPayload.items.find((item) => item.publicCode === orderA1.publicCode)).toMatchObject({ publicCode: orderA1.publicCode, orderItems: expect.any(Array) });
      const wrongPickupRole = await clientContext.request.post(`/api/deliveries/${deliveryA1!.id}/verify/pickup`, { data: { code: "000000" } });
      expect(wrongPickupRole.status()).not.toBe(200);
      await completeMission({ courierPage, merchantPage: merchantAPage, clientContext, order: orderA1, deliveryId: deliveryA1!.id });
      const finalClientOrder = await responseData<{ delivery: { recipientCode: string | null } }>(await clientContext.request.get(`/api/orders/${orderA1.id}`));
      expect(finalClientOrder.delivery.recipientCode).toBeNull();
      const merchantFinal = await responseData<{ items: Array<{ id: string; status: string }> }>(await merchantAContext.request.get(`/api/merchant/deliveries?merchantId=${merchantA.id}`));
      expect(merchantFinal.items.find((item) => item.id === deliveryA1!.id)?.status).toBe("delivered");
      const { data: storedA1 } = await admin.from("deliveries").select("courier_fee_xof, courier_payable_xof, courier_payment_status").eq("id", deliveryA1!.id).single();
      expect(storedA1).toMatchObject({ courier_fee_xof: 1200, courier_payable_xof: 1200, courier_payment_status: "due" });

      await assignViaUi(merchantAPage, orderA2.id, membershipA!.id);
      const { data: deliveryA2 } = await admin.from("deliveries").select("id").eq("order_id", orderA2.id).single();
      await completeMission({ courierPage, merchantPage: merchantAPage, clientContext, order: orderA2, deliveryId: deliveryA2!.id, fail: true });
      await openCourierTab(merchantAPage);
      const failedRow = merchantAPage.locator("article.courier-delivery-row").filter({ hasText: orderA2.publicCode });
      merchantAPage.once("dialog", (dialog) => dialog.accept("2500"));
      await activateButton(failedRow.getByRole("button", { name: "Fixer la compensation" }));
      await expect(merchantAPage.getByRole("status")).toContainText("Compensation enregistrée");
      expect((await admin.from("deliveries").select("courier_payable_xof, courier_payment_status").eq("id", deliveryA2!.id).single()).data).toMatchObject({ courier_payable_xof: 2500, courier_payment_status: "due" });

      await assignViaUi(merchantAPage, orderA3.id, membershipA!.id);
      const { data: deliveryA3 } = await admin.from("deliveries").select("id").eq("order_id", orderA3.id).single();
      await completeMission({ courierPage, merchantPage: merchantAPage, clientContext, order: orderA3, deliveryId: deliveryA3!.id });

      const invitationB = await inviteCourier(merchantBPage, merchantB.id, emails.courier, "B");
      await claimInvitation(courierContext, invitationB);
      await responseData(await courierContext.request.patch("/api/courier/payment-profile", { data: { wavePaymentNumber: "+221770002223", orangeMoneyPaymentNumber: "+221770002224", preferredPaymentChannel: "orange_money" } }));
      const { data: membershipB } = await admin.from("courier_memberships").select("id").eq("merchant_id", merchantB.id).eq("courier_user_id", courierUser).single();
      await assignViaUi(merchantBPage, orderB1.id, membershipB!.id);
      const { data: deliveryB1 } = await admin.from("deliveries").select("id").eq("order_id", orderB1.id).single();
      await completeMission({ courierPage, merchantPage: merchantBPage, clientContext, order: orderB1, deliveryId: deliveryB1!.id });

      const groupedStats = await responseData<{ shopStats: Array<{ shopName: string; delivered: number; failed: number; dueXof: number }> }>(await courierContext.request.get("/api/deliveries/mine"));
      expect(groupedStats.shopStats).toEqual(expect.arrayContaining([
        expect.objectContaining({ shopName: merchantA.public_name, delivered: 2, failed: 1, dueXof: 4900 }),
        expect.objectContaining({ shopName: merchantB.public_name, delivered: 1, dueXof: 900 }),
      ]));

      await openCourierTab(merchantBPage);
      const paymentsB = merchantBPage.locator("section.mvp-card").filter({ has: merchantBPage.getByRole("heading", { name: "Régler les livreurs" }) });
      await selectCheckbox(paymentsB.getByText(orderB1.publicCode).locator("..").getByRole("checkbox"));
      await paymentsB.getByLabel("Moyen").selectOption("orange_money");
      await paymentsB.getByLabel("Référence du transfert").fill(`OM-COURIER-${runId}`);
      await activateButton(paymentsB.getByRole("button", { name: /Déclarer le transfert \(1\)/ }));
      await expect.poll(async () => (await admin.from("courier_payouts").select("status").eq("external_reference", `OM-COURIER-${runId}`).single()).data?.status).toBe("pending_confirmation");
      expect((await admin.from("courier_payouts").select("payment_method, destination_number, amount_xof").eq("external_reference", `OM-COURIER-${runId}`).single()).data).toMatchObject({ payment_method: "orange_money", destination_number: "+221770002224", amount_xof: 900 });
      await courierPage.goto("/marchand?mode=missions");
      const orangePayout = courierPage.locator("article.courier-shop-profile").filter({ hasText: `OM-COURIER-${runId}` });
      await activateButton(orangePayout.getByRole("button", { name: "Confirmer la réception" }));
      await expect.poll(async () => (await admin.from("courier_payouts").select("status").eq("external_reference", `OM-COURIER-${runId}`).single()).data?.status).toBe("confirmed");

      await openCourierTab(merchantAPage);
      const payments = merchantAPage.locator("section.mvp-card").filter({ has: merchantAPage.getByRole("heading", { name: "Régler les livreurs" }) });
      await selectCheckbox(payments.getByText(orderA1.publicCode).locator("..").getByRole("checkbox"));
      await payments.getByLabel("Référence du transfert").fill(`WAVE-SINGLE-${runId}`);
      const singlePayoutResponse = merchantAPage.waitForResponse(
        (response) => response.url().endsWith("/api/merchant/courier-payments") && response.request().method() === "POST",
      );
      await activateButton(payments.getByRole("button", { name: /Déclarer le transfert \(1\)/ }));
      expect((await singlePayoutResponse).status()).toBe(201);
      await expect(merchantAPage.getByRole("status")).toContainText("Transfert déclaré", { timeout: 15_000 });
      await expect(payments.getByRole("button", { name: "Déclarer le transfert (0)" })).toBeDisabled({ timeout: 15_000 });
      await selectCheckbox(payments.getByText(orderA2.publicCode).locator("..").getByRole("checkbox"));
      await selectCheckbox(payments.getByText(orderA3.publicCode).locator("..").getByRole("checkbox"));
      await payments.getByLabel("Moyen").selectOption("wave");
      await payments.getByLabel("Référence du transfert").fill(`WAVE-${runId}`);
      const groupedPayoutResponse = merchantAPage.waitForResponse(
        (response) => response.url().endsWith("/api/merchant/courier-payments") && response.request().method() === "POST",
      );
      await activateButton(payments.getByRole("button", { name: /Déclarer le transfert \(2\)/ }));
      expect((await groupedPayoutResponse).status()).toBe(201);
      await expect(merchantAPage.getByRole("status")).toContainText("Transfert déclaré", { timeout: 15_000 });
      const { data: payouts } = await admin.from("courier_payouts").select("amount_xof, external_reference, status").eq("merchant_id", merchantA.id).order("amount_xof");
      expect(payouts).toEqual(expect.arrayContaining([expect.objectContaining({ amount_xof: 1200, status: "pending_confirmation" }), expect.objectContaining({ amount_xof: 3700, external_reference: `WAVE-${runId}`, status: "pending_confirmation" })]));
      await courierPage.goto("/marchand?mode=missions");
      await expect(courierPage.getByRole("heading", { name: "Mes règlements" })).toBeVisible();
      await expect(courierPage.getByText(`réf. WAVE-${runId}`)).toBeVisible();
      const singlePayout = courierPage.locator("article.courier-shop-profile").filter({ hasText: `WAVE-SINGLE-${runId}` });
      await activateButton(singlePayout.getByRole("button", { name: "Confirmer la réception" }));
      await expect(courierPage.getByRole("status")).toContainText("confirmée");
      const contestedPayout = courierPage.locator("article.courier-shop-profile").filter({ hasText: `WAVE-${runId}` }).filter({ hasNotText: `WAVE-SINGLE-${runId}` });
      courierPage.once("dialog", (dialog) => dialog.accept("Le transfert groupé n’est pas visible dans mon wallet"));
      await activateButton(contestedPayout.getByRole("button", { name: "Contester" }));
      await expect(courierPage.getByRole("status")).toContainText("missions redeviennent dues");
      expect(await courierPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await merchantAPage.reload();
      await openCourierTab(merchantAPage);
      const refreshedPayments = merchantAPage.locator("section.mvp-card").filter({ has: merchantAPage.getByRole("heading", { name: "Régler les livreurs" }) });
      const groupedPayoutRow = refreshedPayments.locator(".mvp-row").filter({ hasText: `WAVE-${runId}` }).filter({ hasNotText: `WAVE-SINGLE-${runId}` });
      merchantAPage.once("dialog", (dialog) => dialog.accept("Référence saisie sur le mauvais bordereau"));
      await activateButton(groupedPayoutRow.getByRole("button", { name: "Annuler" }));
      await expect(merchantAPage.getByRole("status")).toContainText("missions sont de nouveau dues");
      const { data: voidedGroup } = await admin.from("courier_payouts").select("status, void_reason").eq("external_reference", `WAVE-${runId}`).single();
      expect(voidedGroup).toMatchObject({ status: "voided", void_reason: "Référence saisie sur le mauvais bordereau" });
      const { data: payableAgain } = await admin.from("deliveries").select("id, courier_payment_status").in("id", [deliveryA2!.id, deliveryA3!.id]);
      expect(payableAgain?.every((delivery) => delivery.courier_payment_status === "due")).toBe(true);

      const clientPage = await clientContext.newPage();
      await clientPage.goto(`/commandes/${orderA3.id}`);
      await activateButton(clientPage.getByRole("button", { name: "Ouvrir un litige de livraison" }));
      await clientPage.getByLabel(/Décrivez précisément le problème/).fill("Le colis livré présente un problème nécessitant une vérification du trajet.");
      await activateButton(clientPage.getByRole("button", { name: "Transmettre au support" }));
      await expect(clientPage.getByText(/litige de livraison est transmis/i)).toBeVisible();
      await courierPage.goto("/marchand?mode=missions");
      await activateButton(courierPage.getByRole("button", { name: "Livrée", exact: true }));
      let disputedMission = courierPage.locator("article.courier-mission").filter({ hasText: orderA3.publicCode });
      await expect(disputedMission).toContainText("Litige actif");
      await expect(disputedMission).toContainText("+221770002222");
      const { data: dispute } = await admin.from("delivery_disputes").select("id").eq("delivery_id", deliveryA3!.id).eq("status", "open").single();
      await enableAdminMfa(supportPage);
      await supportPage.goto("/admin");
      await supportPage.locator("button").filter({ hasText: "Litiges" }).click({ force: true, timeout: 15_000 });
      const supportDisputeRow = supportPage.locator(".admin-payment-row").filter({ hasText: orderA3.publicCode });
      await expect(supportDisputeRow.getByRole("button", { name: "Enregistrer la décision" })).toBeEnabled({ timeout: 15_000 });
      supportPage.once("dialog", (dialog) => dialog.accept("Trajet vérifié et dossier clôturé."));
      await activateButton(supportDisputeRow.getByRole("button", { name: "Enregistrer la décision" }));
      await expect.poll(async () => (await admin.from("delivery_disputes").select("status").eq("id", dispute!.id).single()).data?.status, { timeout: 15_000 }).toBe("resolved");
      await courierPage.reload();
      await activateButton(courierPage.getByRole("button", { name: "Livrée", exact: true }));
      disputedMission = courierPage.locator("article.courier-mission").filter({ hasText: orderA3.publicCode });
      await expect(disputedMission).toContainText("Coordonnées personnelles masquées");
      await expect(disputedMission).not.toContainText("+221770002222");

      const outsiderMine = await responseData<{ items: unknown[] }>(await outsiderContext.request.get("/api/deliveries/mine"));
      expect(outsiderMine.items).toHaveLength(0);
      expect((await merchantBContext.request.get(`/api/merchant/courier-payments?merchantId=${merchantA.id}`)).status()).toBe(403);
      expect((await outsiderContext.request.post(`/api/deliveries/${deliveryB1!.id}/status`, { data: { status: "accepted" } })).status()).not.toBe(200);
      expect((await outsiderContext.request.get(`/api/orders/${orderA1.id}`)).status()).not.toBe(200);
      await clientPage.close();
    } finally {
      await Promise.all([merchantAContext.close(), merchantBContext.close(), clientContext.close(), courierContext.close(), outsiderContext.close(), supportContext.close()]);
    }
  });
});
