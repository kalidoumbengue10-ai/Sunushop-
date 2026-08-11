import { expect, test, type APIResponse, type BrowserContext, type Page } from "@playwright/test";
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

async function createUser(email: string, name: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name, e2e_run_id: runId } });
  if (error || !data.user) throw error ?? new Error(`Utilisateur non créé : ${email}`);
  created.userIds.push(data.user.id);
  return data.user.id;
}

async function signIn(context: BrowserContext, email: string) {
  await responseData(await context.request.post("/api/auth/password/sign-in", { data: { email, password } }));
}

async function createMerchant(ownerUserId: string, ownerEmail: string, suffix: string) {
  const { data, error } = await admin.from("merchant_accounts").insert({
    owner_user_id: ownerUserId, kind: "informal", public_name: `Boutique livreur ${suffix} ${runId}`,
    slug: `boutique-livreur-${suffix.toLowerCase()}-${runId}`, description: "Boutique éphémère du test livreur.",
    phone: "+221770001111", email: ownerEmail, region: "Dakar", city: "Dakar",
    wave_payment_number: "+221770001111",
    address_hint: `Point de retrait ${suffix}`, pickup_address_line: `12 rue ${suffix}, Dakar`,
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
    data: { recipient: { name: `Client ${label}`, phone: "+221770002222", region: "Dakar", city: "Dakar", addressHint: `45 avenue Client ${label}` }, groups: [{ merchantId, deliveryZoneId: zoneId, methodKind: "merchant_delivery", paymentMethod: "wave_direct", items: [{ variantId, quantity: 2 }] }] },
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
  await card.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation livreur envoyée");
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
  await form.getByRole("button", { name: "Affecter" }).click();
  await expect(page.getByRole("status")).toContainText("Livraison affectée");
}

async function completeMission(options: {
  courierPage: Page; merchantPage: Page; clientContext: BrowserContext; order: { id: string; publicCode: string };
  deliveryId: string; fail?: boolean;
}) {
  const { courierPage, merchantPage, clientContext, order, deliveryId, fail } = options;
  await courierPage.goto("/marchand?mode=missions");
  let mission = courierPage.locator("article.courier-mission").filter({ hasText: order.publicCode });
  await mission.getByRole("button", { name: "Accepter la mission" }).click();
  await mission.getByRole("button", { name: "Je suis au commerce" }).click();
  const pickupCode = (await mission.locator(".courier-pickup-code strong").textContent())?.trim() ?? "";
  expect(pickupCode).toMatch(/^\d{6}$/);

  await merchantPage.goto("/marchand");
  await merchantPage.getByRole("button", { name: /^Livreurs/ }).click({ force: true });
  const merchantMission = merchantPage.locator("article.courier-delivery-row").filter({ hasText: order.publicCode });
  await merchantMission.locator('input[name="code"]').fill(pickupCode);
  await merchantMission.getByRole("button", { name: "Autoriser le retrait" }).click();
  await expect(merchantPage.getByRole("status")).toContainText("Retrait confirmé");
  const afterPickup = await responseData<{ items: Array<{ id: string; pickupCode: string | null }> }>(await courierPage.context().request.get("/api/deliveries/mine"));
  expect(afterPickup.items.find((item) => item.id === deliveryId)?.pickupCode).toBeNull();

  await courierPage.reload();
  await courierPage.getByRole("button", { name: "En cours", exact: true }).click();
  mission = courierPage.locator("article.courier-mission").filter({ hasText: order.publicCode });
  if (fail) {
    courierPage.once("dialog", (dialog) => dialog.accept("Client absent après plusieurs appels"));
    await mission.getByRole("button", { name: "Signaler un échec" }).click();
    await expect.poll(async () => (await admin.from("deliveries").select("status").eq("id", deliveryId).single()).data?.status).toBe("failed");
    return;
  }
  await mission.getByRole("button", { name: "Démarrer le trajet" }).click();
  const clientOrder = await responseData<{ delivery: { recipientCode: string } }>(await clientContext.request.get(`/api/orders/${order.id}`));
  expect(clientOrder.delivery.recipientCode).toMatch(/^\d{6}$/);
  await mission.locator('input[name="code"]').fill(clientOrder.delivery.recipientCode);
  await mission.getByRole("button", { name: "Confirmer la remise" }).click();
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
    };
    const [merchantAUser, merchantBUser, clientUser, courierUser] = await Promise.all([
      createUser(emails.merchantA, "Marchand A"), createUser(emails.merchantB, "Marchand B"),
      createUser(emails.client, "Client livraison"), createUser(emails.courier, "Livreur principal"), createUser(emails.outsider, "Livreur extérieur"),
    ]);
    expect(clientUser).toBeTruthy(); expect(courierUser).toBeTruthy();

    const merchantAContext = await browser.newContext(); const merchantBContext = await browser.newContext();
    const clientContext = await browser.newContext(); const courierContext = await browser.newContext(); const outsiderContext = await browser.newContext();
    await Promise.all([signIn(merchantAContext, emails.merchantA), signIn(merchantBContext, emails.merchantB), signIn(clientContext, emails.client), signIn(courierContext, emails.courier), signIn(outsiderContext, emails.outsider)]);
    const merchantAPage = await merchantAContext.newPage(); const merchantBPage = await merchantBContext.newPage(); const courierPage = await courierContext.newPage();

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
      await blockedForm.getByRole("button", { name: "Affecter" }).click();
      await expect(merchantAPage.locator(".mvp-alert--error")).toContainText("rémunération du livreur");

      await merchantAPage.getByRole("button", { name: /^Livraison/ }).click({ force: true });
      await merchantAPage.getByRole("button", { name: "Modifier les tarifs" }).click();
      await merchantAPage.getByLabel("Rémunération du livreur (FCFA)").fill("1200");
      await merchantAPage.getByRole("button", { name: "Enregistrer Dakar" }).click();
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
      await failedRow.getByRole("button", { name: "Fixer la compensation" }).click();
      await expect(merchantAPage.getByRole("status")).toContainText("Compensation enregistrée");
      expect((await admin.from("deliveries").select("courier_payable_xof, courier_payment_status").eq("id", deliveryA2!.id).single()).data).toMatchObject({ courier_payable_xof: 2500, courier_payment_status: "due" });

      await assignViaUi(merchantAPage, orderA3.id, membershipA!.id);
      const { data: deliveryA3 } = await admin.from("deliveries").select("id").eq("order_id", orderA3.id).single();
      await completeMission({ courierPage, merchantPage: merchantAPage, clientContext, order: orderA3, deliveryId: deliveryA3!.id });

      const invitationB = await inviteCourier(merchantBPage, merchantB.id, emails.courier, "B");
      await claimInvitation(courierContext, invitationB);
      await responseData(await courierContext.request.patch("/api/courier/payment-profile", { data: { wavePaymentNumber: "+221770002223", orangeMoneyPaymentNumber: null, preferredPaymentChannel: "wave" } }));
      const { data: membershipB } = await admin.from("courier_memberships").select("id").eq("merchant_id", merchantB.id).eq("courier_user_id", courierUser).single();
      await assignViaUi(merchantBPage, orderB1.id, membershipB!.id);
      const { data: deliveryB1 } = await admin.from("deliveries").select("id").eq("order_id", orderB1.id).single();
      await completeMission({ courierPage, merchantPage: merchantBPage, clientContext, order: orderB1, deliveryId: deliveryB1!.id });

      const groupedStats = await responseData<{ shopStats: Array<{ shopName: string; delivered: number; failed: number; dueXof: number }> }>(await courierContext.request.get("/api/deliveries/mine"));
      expect(groupedStats.shopStats).toEqual(expect.arrayContaining([
        expect.objectContaining({ shopName: merchantA.public_name, delivered: 2, failed: 1, dueXof: 4900 }),
        expect.objectContaining({ shopName: merchantB.public_name, delivered: 1, dueXof: 900 }),
      ]));

      await openCourierTab(merchantAPage);
      const payments = merchantAPage.locator("section.mvp-card").filter({ has: merchantAPage.getByRole("heading", { name: "Régler les livreurs" }) });
      await payments.getByText(orderA1.publicCode).locator("..").getByRole("checkbox").check();
      await payments.getByLabel("Référence du transfert").fill(`WAVE-SINGLE-${runId}`);
      const singlePayoutResponse = merchantAPage.waitForResponse(
        (response) => response.url().endsWith("/api/merchant/courier-payments") && response.request().method() === "POST",
      );
      await payments.getByRole("button", { name: /Déclarer le transfert \(1\)/ }).click();
      expect((await singlePayoutResponse).status()).toBe(201);
      await expect(merchantAPage.getByRole("status")).toContainText("Transfert déclaré", { timeout: 15_000 });
      await payments.getByText(orderA2.publicCode).locator("..").getByRole("checkbox").check();
      await payments.getByText(orderA3.publicCode).locator("..").getByRole("checkbox").check();
      await payments.getByLabel("Moyen").selectOption("wave");
      await payments.getByLabel("Référence du transfert").fill(`WAVE-${runId}`);
      const groupedPayoutResponse = merchantAPage.waitForResponse(
        (response) => response.url().endsWith("/api/merchant/courier-payments") && response.request().method() === "POST",
      );
      await payments.getByRole("button", { name: /Déclarer le transfert \(2\)/ }).click();
      expect((await groupedPayoutResponse).status()).toBe(201);
      await expect(merchantAPage.getByRole("status")).toContainText("Transfert déclaré", { timeout: 15_000 });
      const { data: payouts } = await admin.from("courier_payouts").select("amount_xof, external_reference, status").eq("merchant_id", merchantA.id).order("amount_xof");
      expect(payouts).toEqual(expect.arrayContaining([expect.objectContaining({ amount_xof: 1200, status: "pending_confirmation" }), expect.objectContaining({ amount_xof: 3700, external_reference: `WAVE-${runId}`, status: "pending_confirmation" })]));
      await courierPage.goto("/marchand?mode=missions");
      await expect(courierPage.getByRole("heading", { name: "Mes règlements" })).toBeVisible();
      await expect(courierPage.getByText(`réf. WAVE-${runId}`)).toBeVisible();
      const singlePayout = courierPage.locator("article.courier-shop-profile").filter({ hasText: `WAVE-SINGLE-${runId}` });
      await singlePayout.getByRole("button", { name: "Confirmer la réception" }).click();
      await expect(courierPage.getByRole("status")).toContainText("confirmée");
      const contestedPayout = courierPage.locator("article.courier-shop-profile").filter({ hasText: `WAVE-${runId}` }).filter({ hasNotText: `WAVE-SINGLE-${runId}` });
      courierPage.once("dialog", (dialog) => dialog.accept("Le transfert groupé n’est pas visible dans mon wallet"));
      await contestedPayout.getByRole("button", { name: "Contester" }).click();
      await expect(courierPage.getByRole("status")).toContainText("missions redeviennent dues");
      expect(await courierPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      await merchantAPage.reload();
      await openCourierTab(merchantAPage);
      const refreshedPayments = merchantAPage.locator("section.mvp-card").filter({ has: merchantAPage.getByRole("heading", { name: "Régler les livreurs" }) });
      const groupedPayoutRow = refreshedPayments.locator(".mvp-row").filter({ hasText: `WAVE-${runId}` }).filter({ hasNotText: `WAVE-SINGLE-${runId}` });
      merchantAPage.once("dialog", (dialog) => dialog.accept("Référence saisie sur le mauvais bordereau"));
      await groupedPayoutRow.getByRole("button", { name: "Annuler" }).click();
      await expect(merchantAPage.getByRole("status")).toContainText("missions sont de nouveau dues");
      const { data: voidedGroup } = await admin.from("courier_payouts").select("status, void_reason").eq("external_reference", `WAVE-${runId}`).single();
      expect(voidedGroup).toMatchObject({ status: "voided", void_reason: "Référence saisie sur le mauvais bordereau" });
      const { data: payableAgain } = await admin.from("deliveries").select("id, courier_payment_status").in("id", [deliveryA2!.id, deliveryA3!.id]);
      expect(payableAgain?.every((delivery) => delivery.courier_payment_status === "due")).toBe(true);

      const clientPage = await clientContext.newPage();
      await clientPage.goto(`/commandes/${orderA3.id}`);
      await clientPage.getByRole("button", { name: "Ouvrir un litige de livraison" }).click();
      await clientPage.getByLabel(/Décrivez précisément le problème/).fill("Le colis livré présente un problème nécessitant une vérification du trajet.");
      await clientPage.getByRole("button", { name: "Transmettre au support" }).click();
      await expect(clientPage.getByText(/litige de livraison est transmis/i)).toBeVisible();
      await courierPage.goto("/marchand?mode=missions");
      await courierPage.getByRole("button", { name: "Livrée", exact: true }).click();
      let disputedMission = courierPage.locator("article.courier-mission").filter({ hasText: orderA3.publicCode });
      await expect(disputedMission).toContainText("Litige actif");
      await expect(disputedMission).toContainText("+221770002222");
      const { data: dispute } = await admin.from("delivery_disputes").select("id").eq("delivery_id", deliveryA3!.id).eq("status", "open").single();
      const resolvedAt = new Date().toISOString();
      await admin.from("delivery_disputes").update({ status: "resolved", resolution: "Trajet vérifié et dossier clôturé.", resolved_at: resolvedAt, resolved_by: merchantAUser }).eq("id", dispute!.id);
      await admin.from("delivery_dispute_events").insert({ dispute_id: dispute!.id, actor_id: merchantAUser, event_type: "resolved", message: "Trajet vérifié et dossier clôturé." });
      await courierPage.reload();
      await courierPage.getByRole("button", { name: "Livrée", exact: true }).click();
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
      await Promise.all([merchantAContext.close(), merchantBContext.close(), clientContext.close(), courierContext.close(), outsiderContext.close()]);
    }
  });
});
