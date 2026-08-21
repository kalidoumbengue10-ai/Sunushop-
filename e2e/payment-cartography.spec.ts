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
const password = `SunuShop-Payments-${crypto.randomUUID()}!`;
const created = { userIds: [] as string[], merchantIds: [] as string[] };

type TestOrder = { id: string; publicCode: string; totalXof: number };

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
    public_name: `Boutique paiements ${runId}`,
    slug: `boutique-paiements-${runId}`,
    description: "Boutique ephemere du test de cartographie des paiements.",
    phone: "+221770004441",
    email,
    region: "Dakar",
    city: "Dakar",
    wave_payment_number: "+221770004441",
    orange_money_payment_number: "+221770004442",
    pickup_enabled: true,
    pickup_address_line: "17 avenue du retrait, Dakar",
    pickup_latitude: 14.7167,
    pickup_longitude: -17.4677,
    pickup_hours: "Du lundi au samedi, 9h-18h",
    pickup_instructions: "Presenter le numero de commande au comptoir",
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

async function createCatalog(context: BrowserContext, merchantId: string) {
  const { data: category, error } = await admin.from("categories").select("id").eq("active", true).limit(1).single();
  if (error) throw error;
  const zone = await responseData<{ zoneId: string }>(await context.request.post("/api/merchant/delivery-zones", { data: {
    merchantId,
    methodKind: "merchant_delivery",
    methodName: "Livraison Dakar",
    region: "Dakar",
    city: "Dakar",
    label: `Dakar paiements ${runId}`,
    feeXof: 1500,
    courierFeeXof: 900,
    minDelayMinutes: 30,
    maxDelayMinutes: 180,
  } }), 201);
  const product = await responseData<{ variantId: string }>(await context.request.post("/api/merchant/products", { data: {
    merchantId,
    categoryId: category.id,
    title: `Article paiements ${runId}`,
    slug: `article-paiements-${runId}`,
    description: "Article reserve a la cartographie Playwright des paiements.",
    sku: `PAY-${runId}`,
    variantTitle: "Standard",
    priceXof: 5000,
    stock: 30,
    publish: true,
  } }), 201);
  return { zoneId: zone.zoneId, variantId: product.variantId };
}

async function createOrder(
  client: BrowserContext,
  merchantId: string,
  variantId: string,
  label: string,
  paymentMethod: "orange_money_direct" | "cash_on_delivery",
  methodKind: "merchant_delivery" | "pickup",
  zoneId?: string,
) {
  const data = await responseData<{ orders: TestOrder[] }>(await client.request.post("/api/orders/batch", {
    headers: { "idempotency-key": `payments-${runId}-${label}` },
    data: {
      recipient: { name: `Client ${label}`, phone: "+221770004443", region: "Dakar", city: "Dakar", addressHint: `Adresse client ${label}`, latitude: 14.72, longitude: -17.45 },
      groups: [{ merchantId, ...(zoneId ? { deliveryZoneId: zoneId } : {}), methodKind, paymentMethod, items: [{ variantId, quantity: 1 }] }],
    },
  }), 201);
  return data.orders[0];
}

async function openMerchantOrders(page: Page) {
  await page.goto("/marchand");
  await page.getByRole("button", { name: /^Commandes/ }).click({ force: true });
  await expect(page.getByRole("heading", { name: "Commandes", exact: true, level: 2 })).toBeVisible();
}

function merchantOrderRow(page: Page, publicCode: string) {
  return page.locator(".mvp-row").filter({ hasText: publicCode });
}

async function declareOrangeMoneyFromClient(page: Page, order: TestOrder, reference: string) {
  await page.goto(`/commandes/${order.id}`);
  await expect(page.getByText("Orange Money", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Référence du transfert").fill(reference);
  const declarationResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/orders/${order.id}/payment-declarations`)
      && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Déclarer le paiement" }).click();
  expect((await declarationResponse).status()).toBe(201);
  await expect.poll(async () => (await admin.from("orders").select("payment_status").eq("id", order.id).single()).data?.payment_status).toBe("pending_confirmation");
  // L'ecran client ne se recharge actuellement pas apres la declaration :
  // le test poursuit la cartographie apres un rechargement explicite.
  await page.reload();
  await expect(page.locator(".mvp-alert").filter({ hasText: reference })).toContainText("en attente de confirmation");
}

async function confirmDirectPayment(merchantPage: Page, order: TestOrder, reference: string) {
  await openMerchantOrders(merchantPage);
  const row = merchantOrderRow(merchantPage, order.publicCode);
  await activate(row.getByRole("button", { name: `Confirmer ${reference}` }));
  await expect.poll(async () => (await admin.from("orders").select("payment_status").eq("id", order.id).single()).data?.payment_status).toBe("paid");
}

function decodeBase32(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.toUpperCase().replace(/=+$/u, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string) {
  const counter = Math.floor(Date.now() / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function enableAdminMfa(page: Page) {
  await page.goto("/admin/securite");
  const enrollment = page.waitForResponse((response) => response.url().includes("/auth/v1/factors") && response.request().method() === "POST");
  await activate(page.getByRole("button", { name: /Configurer la vérification en deux étapes/i }));
  const payload = await (await enrollment).json() as { totp?: { secret?: string } };
  const secret = payload.totp?.secret;
  if (!secret) throw new Error("Secret TOTP absent de la reponse Supabase MFA.");
  await page.getByLabel(/Code à 6 chiffres/i).fill(totp(secret));
  await activate(page.getByRole("button", { name: /Activer la protection/i }));
  await page.waitForURL("**/admin/crm", { timeout: 20_000 });
}

async function openAdminDisputes(page: Page) {
  await page.goto("/admin");
  await page.locator("button").filter({ hasText: "Litiges" }).click({ force: true, timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Commandes en litige" })).toBeVisible();
}

async function openOrderDispute(clientPage: Page, order: TestOrder, reason: string) {
  await clientPage.goto(`/commandes/${order.id}`);
  await activate(clientPage.getByRole("button", { name: "Signaler un problème de commande ou de paiement" }));
  await clientPage.getByLabel(/Décrivez le problème rencontré/).fill(reason);
  await activate(clientPage.getByRole("button", { name: "Envoyer le signalement" }));
  await expect.poll(async () => (await admin.from("order_disputes").select("status").eq("order_id", order.id).single()).data?.status, { timeout: 15_000 }).toBe("open");
  await clientPage.reload();
  await expect(clientPage.getByText(/Litige de commande/)).toContainText("open");
}

async function declareRefundViaMerchant(page: Page, order: TestOrder, reference: string) {
  await openMerchantOrders(page);
  await activate(merchantOrderRow(page, order.publicCode).getByRole("button", { name: "Déclarer un remboursement" }));
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: /Déclarer le remboursement/ }) });
  await form.getByLabel("Montant remboursé (FCFA)").fill(String(order.totalXof));
  await form.getByLabel("Canal").selectOption("orange_money");
  await form.getByLabel("Numéro du client").fill("+221770004443");
  await form.getByLabel("Référence du transfert").fill(reference);
  await form.getByRole("button", { name: "Transmettre au client" }).click();
  await expect(page.locator(".merchant-global-feedback")).toContainText("Remboursement transmis", { timeout: 15_000 });
}

async function cleanup() {
  for (const merchantId of created.merchantIds.reverse()) {
    await admin.from("order_disputes").delete().eq("merchant_id", merchantId);
    await admin.from("order_refunds").delete().eq("merchant_id", merchantId);
    await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: merchantId });
  }
  for (const userId of created.userIds.reverse()) await admin.auth.admin.deleteUser(userId);
}

test.describe.serial("cartographie des paiements directs", () => {
  test.afterAll(cleanup);

  test("Orange Money, refus, remboursements, litiges support et especes au retrait", async ({ browser }) => {
    test.setTimeout(600_000);
    const emails = {
      merchant: `payments-merchant-${runId}@example.test`,
      client: `payments-client-${runId}@example.test`,
      support: `payments-support-${runId}@example.test`,
    };
    const [merchantUserId, clientUserId, supportUserId] = await Promise.all([
      createUser(emails.merchant, "Marchand paiements"),
      createUser(emails.client, "Client paiements"),
      createUser(emails.support, "Support paiements"),
    ]);
    expect(clientUserId).toBeTruthy();
    const { error: roleError } = await admin.from("admin_roles").insert({ user_id: supportUserId, role: "support" });
    if (roleError) throw roleError;

    const merchantContext = await browser.newContext();
    const clientContext = await browser.newContext();
    const supportContext = await browser.newContext();
    await Promise.all([signIn(merchantContext, emails.merchant), signIn(clientContext, emails.client), signIn(supportContext, emails.support)]);
    const merchantPage = await merchantContext.newPage();
    const clientPage = await clientContext.newPage();
    const supportPage = await supportContext.newPage();

    try {
      const merchant = await createMerchant(merchantUserId, emails.merchant);
      const catalog = await createCatalog(merchantContext, merchant.id);
      const refusedThenRefunded = await createOrder(clientContext, merchant.id, catalog.variantId, "refused-refunded", "orange_money_direct", "merchant_delivery", catalog.zoneId);
      const closedWithoutRefund = await createOrder(clientContext, merchant.id, catalog.variantId, "no-refund", "orange_money_direct", "merchant_delivery", catalog.zoneId);
      const refundContested = await createOrder(clientContext, merchant.id, catalog.variantId, "refund-contested", "orange_money_direct", "merchant_delivery", catalog.zoneId);

      await declareOrangeMoneyFromClient(clientPage, refusedThenRefunded, `OM-REFUSED-${runId}`);
      await openMerchantOrders(merchantPage);
      let row = merchantOrderRow(merchantPage, refusedThenRefunded.publicCode);
      await activate(row.getByRole("button", { name: "Refuser" }));
      await merchantPage.getByLabel("Motif communiqué au client").fill("Reference non visible dans le wallet");
      const rejectionResponse = merchantPage.waitForResponse((response) =>
        response.url().includes(`/api/orders/${refusedThenRefunded.id}/payment-declarations`)
          && response.request().method() === "PATCH",
      );
      await merchantPage.getByRole("button", { name: "Confirmer le refus" }).click();
      expect((await rejectionResponse).status()).toBe(200);
      await expect.poll(async () => (await admin.from("orders").select("payment_status").eq("id", refusedThenRefunded.id).single()).data?.payment_status, { timeout: 15_000 }).toBe("payment_refused");
      const blockedProgress = await merchantContext.request.post(`/api/orders/${refusedThenRefunded.id}/status`, { data: { status: "confirmed", publicMessage: "Tentative bloquee" } });
      expect(blockedProgress.status()).not.toBe(200);
      await clientPage.reload();
      await expect(clientPage.getByText(/Reference non visible/i)).toBeVisible();
      await clientPage.getByLabel("Référence du transfert").fill(`OM-RETRY-${runId}`);
      await activate(clientPage.getByRole("button", { name: "Déclarer le paiement" }));
      await confirmDirectPayment(merchantPage, refusedThenRefunded, `OM-RETRY-${runId}`);

      for (const [order, label] of [[closedWithoutRefund, "NOREF"], [refundContested, "CONTEST"]] as const) {
        await declareOrangeMoneyFromClient(clientPage, order, `OM-${label}-${runId}`);
        await confirmDirectPayment(merchantPage, order, `OM-${label}-${runId}`);
      }

      await declareRefundViaMerchant(merchantPage, refusedThenRefunded, `OM-REFUND-OK-${runId}`);
      await clientPage.goto(`/commandes/${refusedThenRefunded.id}`);
      await activate(clientPage.getByRole("button", { name: "Confirmer la réception" }));
      await expect(clientPage.getByText("Remboursement confirmé.")).toBeVisible();
      expect((await admin.from("orders").select("payment_status").eq("id", refusedThenRefunded.id).single()).data?.payment_status).toBe("refunded");

      await openOrderDispute(clientPage, closedWithoutRefund, "Le paiement doit etre verifie mais aucun remboursement ne semble necessaire.");
      await openOrderDispute(clientPage, refundContested, "La commande presente un probleme et necessite une decision de remboursement du support.");
      await enableAdminMfa(supportPage);
      await openAdminDisputes(supportPage);
      let supportRow = supportPage.locator(".admin-payment-row").filter({ hasText: closedWithoutRefund.publicCode });
      supportPage.once("dialog", (dialog) => dialog.accept("Paiement et commande verifies, aucun remboursement requis"));
      await activate(supportRow.getByRole("button", { name: "Clore sans remboursement" }));
      await expect.poll(async () => (await admin.from("order_disputes").select("status").eq("order_id", closedWithoutRefund.id).single()).data?.status, { timeout: 15_000 }).toBe("no_refund");

      supportRow = supportPage.locator(".admin-payment-row").filter({ hasText: refundContested.publicCode });
      await expect(supportRow.getByRole("button", { name: "Demander un remboursement" })).toBeEnabled({ timeout: 15_000 });
      supportPage.once("dialog", (dialog) => dialog.accept("Remboursement integral requis apres verification du dossier"));
      await activate(supportRow.getByRole("button", { name: "Demander un remboursement" }));
      await expect.poll(async () => (await admin.from("order_disputes").select("status").eq("order_id", refundContested.id).single()).data?.status, { timeout: 15_000 }).toBe("refund_required");

      await declareRefundViaMerchant(merchantPage, refundContested, `OM-REFUND-CONTEST-${runId}`);
      await clientPage.goto(`/commandes/${refundContested.id}`);
      await activate(clientPage.getByRole("button", { name: "Contester" }));
      await clientPage.getByLabel("Motif de la contestation").fill("Le transfert ne figure pas dans mon solde Orange Money");
      await activate(clientPage.getByRole("button", { name: "Envoyer la contestation" }));
      await expect(clientPage.getByText(/Remboursement contesté et transmis au support/i)).toBeVisible({ timeout: 15_000 });
      expect((await admin.from("orders").select("payment_status").eq("id", refundContested.id).single()).data?.payment_status).toBe("paid");
      expect((await admin.from("order_refunds").select("status, contest_reason").eq("order_id", refundContested.id).single()).data).toMatchObject({ status: "contested", contest_reason: "Le transfert ne figure pas dans mon solde Orange Money" });

      const invalidCashDelivery = await clientContext.request.post("/api/orders/batch", {
        headers: { "idempotency-key": `payments-${runId}-invalid-cash` },
        data: {
          recipient: { name: "Client cash invalide", phone: "+221770004443", region: "Dakar", city: "Dakar", addressHint: "Adresse cash invalide", latitude: 14.72, longitude: -17.45 },
          groups: [{ merchantId: merchant.id, deliveryZoneId: catalog.zoneId, methodKind: "merchant_delivery", paymentMethod: "cash_on_delivery", items: [{ variantId: catalog.variantId, quantity: 1 }] }],
        },
      });
      expect(invalidCashDelivery.status()).toBe(400);

      const cashPickup = await createOrder(clientContext, merchant.id, catalog.variantId, "cash-pickup", "cash_on_delivery", "pickup");
      expect((await admin.from("orders").select("payment_status, delivery_fee_xof").eq("id", cashPickup.id).single()).data).toMatchObject({ payment_status: "cash_due", delivery_fee_xof: 0 });
      const prematureCash = await merchantContext.request.post(`/api/orders/${cashPickup.id}/cash-payment`);
      expect(prematureCash.status()).not.toBe(200);
      for (const status of ["confirmed", "preparing", "ready_for_handoff"] as const) {
        await responseData(await merchantContext.request.post(`/api/orders/${cashPickup.id}/status`, { data: { status, publicMessage: `Retrait ${status}` } }));
      }
      await openMerchantOrders(merchantPage);
      row = merchantOrderRow(merchantPage, cashPickup.publicCode);
      await activate(row.getByRole("button", { name: "Confirmer les espèces reçues" }));
      await expect.poll(async () => (await admin.from("orders").select("payment_status").eq("id", cashPickup.id).single()).data?.payment_status).toBe("paid");

      for (const page of [merchantPage, clientPage, supportPage]) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }
    } finally {
      await Promise.all([merchantContext.close(), clientContext.close(), supportContext.close()]);
    }
  });
});
