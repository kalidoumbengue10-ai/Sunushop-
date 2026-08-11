import { expect, test, type APIResponse, type BrowserContext } from "@playwright/test";
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
const emails = {
  merchant: `e2e-merchant-${runId}@example.test`,
  client: `e2e-client-${runId}@example.test`,
  courier: `e2e-courier-${runId}@example.test`,
};

const created = {
  userIds: [] as string[],
  merchantIds: [] as string[],
  orderId: "",
  batchId: "",
  mediaPaths: [] as string[],
  leadIds: [] as string[],
  invitationIds: [] as string[],
  verificationPaths: [] as string[],
};

type JsonObject = Record<string, unknown>;

async function responseData<T extends JsonObject>(response: APIResponse, status: number) {
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: unknown } | null;
  expect(response.status(), JSON.stringify(payload)).toBe(status);
  expect(payload?.data, JSON.stringify(payload)).toBeTruthy();
  return payload!.data!;
}

async function signIn(context: BrowserContext, email: string) {
  const response = await context.request.post("/api/auth/password/sign-in", {
    data: { email, password },
  });
  await responseData(response, 200);
}

async function createUser(email: string, displayName: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, e2e_run_id: runId },
  });
  if (error || !data.user) throw error ?? new Error(`Compte E2E non créé : ${email}`);
  created.userIds.push(data.user.id);
  return data.user.id;
}

async function cleanup() {
  if (created.verificationPaths.length) await admin.storage.from("merchant-verification").remove(created.verificationPaths);
  if (created.mediaPaths.length) {
    await admin.storage.from("product-media").remove(created.mediaPaths);
  }
  if (created.orderId) {
    await admin.from("delivery_events").delete().eq("delivery_id", created.orderId);
    const { data: deliveries } = await admin.from("deliveries").select("id").eq("order_id", created.orderId);
    for (const delivery of deliveries ?? []) {
      await admin.from("delivery_events").delete().eq("delivery_id", delivery.id);
    }
    await admin.from("deliveries").delete().eq("order_id", created.orderId);
    await admin.from("order_events").delete().eq("order_id", created.orderId);
    await admin.from("direct_payment_declarations").delete().eq("order_id", created.orderId);
    await admin.from("order_items").delete().eq("order_id", created.orderId);
    await admin.from("orders").delete().eq("id", created.orderId);
  }
  if (created.batchId) await admin.from("order_batches").delete().eq("id", created.batchId);
  for (const userId of created.userIds) {
    await admin.from("addresses").delete().eq("owner_user_id", userId);
    await admin.from("carts").delete().eq("buyer_id", userId);
  }
  for (const merchantId of created.merchantIds) {
    await admin.from("workspace_invitations").delete().eq("merchant_id", merchantId);
    await admin.from("merchant_accounts").delete().eq("id", merchantId);
  }
  for (const invitationId of created.invitationIds) {
    await admin.from("notification_outbox").delete().eq("dedupe_key", `merchant-invitation:${invitationId}`);
  }
  if (created.invitationIds.length) await admin.from("workspace_invitations").delete().in("id", created.invitationIds);
  for (const leadId of created.leadIds) {
    await admin.from("notification_outbox").delete().eq("dedupe_key", `merchant-application:${leadId}`);
    await admin.from("crm_lead_events").delete().eq("lead_id", leadId);
    await admin.from("crm_tasks").delete().eq("lead_id", leadId);
    await admin.from("crm_lead_notes").delete().eq("lead_id", leadId);
    await admin.from("crm_leads").delete().eq("id", leadId);
  }
  for (const userId of created.userIds.reverse()) {
    await admin.auth.admin.deleteUser(userId);
  }
}

test.describe.serial("flux authentifiés marketplace", () => {
  test.afterAll(cleanup);

  test("marchand → client → livreur, avec isolation et codes uniques", async ({ browser }) => {
    test.setTimeout(240_000);

    const merchantUserId = await createUser(emails.merchant, "Marchand E2E");
    const clientUserId = await createUser(emails.client, "Client E2E");
    const courierUserId = await createUser(emails.courier, "Livreur E2E");

    const { data: category, error: categoryError } = await admin
      .from("categories")
      .select("id")
      .eq("slug", "autres-produits")
      .single();
    if (categoryError) throw categoryError;

    const { data: merchant, error: merchantError } = await admin
      .from("merchant_accounts")
      .insert({
        owner_user_id: merchantUserId,
        kind: "informal",
        public_name: `Boutique E2E ${runId}`,
        slug: `boutique-e2e-${runId}`,
        description: "Boutique fictive créée et supprimée par Playwright.",
        phone: "+221770000001",
        email: emails.merchant,
        region: "Dakar",
        city: "Dakar",
        address_hint: "Point de retrait E2E",
        wave_payment_number: "+221770000001",
        status: "active",
        verification_status: "approved",
        subscription_status: "active",
      })
      .select("id, public_name, slug")
      .single();
    if (merchantError) throw merchantError;
    created.merchantIds.push(merchant.id);
    const { error: membershipError } = await admin.from("merchant_members").insert({
      merchant_id: merchant.id,
      user_id: merchantUserId,
      role: "owner",
    });
    if (membershipError) throw membershipError;

    const merchantContext = await browser.newContext();
    const clientContext = await browser.newContext();
    const courierContext = await browser.newContext();

    try {
      await test.step("le marchand configure sa boutique, sa zone, son stock et sa photo", async () => {
        await signIn(merchantContext, emails.merchant);

        const zone = await responseData<{ methodId: string; zoneId: string }>(
          await merchantContext.request.post("/api/merchant/delivery-zones", {
            data: {
              merchantId: merchant.id,
              methodKind: "merchant_delivery",
              methodName: "Livraison E2E",
              region: "Dakar",
              city: "Dakar",
              label: "Dakar E2E",
              feeXof: 1500,
              courierFeeXof: 1000,
              minDelayMinutes: 30,
              maxDelayMinutes: 120,
            },
          }),
          201,
        );

        const product = await responseData<{ productId: string; variantId: string }>(
          await merchantContext.request.post("/api/merchant/products", {
            data: {
              merchantId: merchant.id,
              categoryId: category.id,
              title: `Produit E2E ${runId}`,
              slug: `produit-e2e-${runId}`,
              description: "Produit fictif servant à valider le parcours complet SunuShop.",
              sku: `SKU-${runId}`,
              variantTitle: "Standard",
              priceXof: 5000,
              stock: 5,
              publish: true,
            },
          }),
          201,
        );

        const savedVariants = await responseData<{ productId: string; variantIds: string[] }>(
          await merchantContext.request.put(`/api/merchant/products/${product.productId}`, {
            data: {
              categoryId: category.id,
              title: `Produit E2E ${runId}`,
              description: "Produit fictif servant à valider le parcours complet SunuShop.",
              optionNames: ["Taille", "Couleur"],
              variants: [
                { id: product.variantId, title: "S · Rouge", attributes: { Taille: "S", Couleur: "Rouge" }, sku: `SKU-S-${runId}`, priceXof: 5500, stock: 5, reserved: 0, lowStockThreshold: 1, active: true },
                { title: "M · Noir", attributes: { Taille: "M", Couleur: "Noir" }, sku: `SKU-M-${runId}`, priceXof: 6000, stock: 3, reserved: 0, lowStockThreshold: 1, active: true },
              ],
            },
          }),
          200,
        );
        expect(savedVariants.variantIds).toHaveLength(2);
        const secondVariantId = savedVariants.variantIds.find((id) => id !== product.variantId)!;
        const { data: storedProduct, error: storedProductError } = await admin
          .from("products")
          .select("option_names")
          .eq("id", product.productId)
          .single();
        if (storedProductError) throw storedProductError;
        expect(storedProduct.option_names).toEqual(["Taille", "Couleur"]);

        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        );
        const media = await responseData<{ id: string; storage_path: string }>(
          await merchantContext.request.post(`/api/merchant/products/${product.productId}/media`, {
            multipart: {
              altText: "Produit de test automatisé",
              file: { name: "produit-e2e.png", mimeType: "image/png", buffer: png },
            },
          }),
          201,
        );
        created.mediaPaths.push(media.storage_path);

        const secondMedia = await responseData<{ id: string; storage_path: string }>(
          await merchantContext.request.post(`/api/merchant/products/${product.productId}/media`, {
            multipart: {
              altText: "Seconde vue du produit de test",
              file: { name: "produit-e2e-seconde-vue.png", mimeType: "image/png", buffer: png },
            },
          }),
          201,
        );
        created.mediaPaths.push(secondMedia.storage_path);
        await responseData(
          await merchantContext.request.patch(`/api/merchant/products/${product.productId}/media/order`, {
            data: { mediaIds: [secondMedia.id, media.id] },
          }),
          200,
        );
        const { data: orderedMedia, error: orderedMediaError } = await admin
          .from("product_media")
          .select("id, position")
          .eq("product_id", product.productId)
          .order("position", { ascending: true });
        if (orderedMediaError) throw orderedMediaError;
        expect(orderedMedia).toEqual([
          { id: secondMedia.id, position: 0 },
          { id: media.id, position: 1 },
        ]);

        const storefront = await responseData<{ products: Array<{ id: string }> }>(
          await merchantContext.request.get("/api/storefront"),
          200,
        );
        expect(storefront.products.some((item) => item.id === product.productId)).toBe(true);

        const page = await merchantContext.newPage();
        await page.goto("/marchand");
        await expect(page.getByRole("heading", { name: merchant.public_name })).toBeVisible();
        await page.getByRole("button", { name: /^Produits/ }).click({ force: true });
        await expect(page.getByText(`Produit E2E ${runId}`)).toBeVisible();
        const productRow = page.locator("article.merchant-product-row").filter({ hasText: `Produit E2E ${runId}` });
        await productRow.getByRole("button", { name: "Variantes et stock" }).click({ force: true });
        const optionValueInputs = page.getByLabel("Valeurs, séparées par virgule, point-virgule ou ligne");
        await optionValueInputs.nth(0).fill("S; M, L");
        await optionValueInputs.nth(1).fill("Rouge, Noir");
        await page.getByRole("button", { name: "Générer la matrice" }).click({ force: true });
        await expect(page.getByText("6 variantes générées. Vérifiez maintenant les prix et les stocks.")).toBeVisible();
        await expect(page.locator(".variant-table tbody tr")).toHaveCount(6);
        const stockInputs = page.locator('.variant-table input[aria-label^="Stock "]');
        for (let index = 0; index < await stockInputs.count(); index += 1) {
          await stockInputs.nth(index).fill("5");
        }
        await page.getByRole("button", { name: "Enregistrer et ajouter les photos" }).click({ force: true });
        await expect(page.getByRole("heading", { name: "Ajoutez les photos du produit" })).toBeVisible();
        await responseData(
          await merchantContext.request.patch("/api/merchant/loyalty", {
            data: { merchantId: merchant.id, accrualEnabled: true },
          }),
          200,
        );

        await test.step("le client enregistre son adresse, synchronise son panier et commande", async () => {
          await signIn(clientContext, emails.client);
          const liveCatalogPage = await clientContext.newPage();
          await liveCatalogPage.goto(`/boutiques/${merchant.slug}`);
          const productCard = liveCatalogPage.locator("article.mvp-product").filter({ hasText: `Produit E2E ${runId}` });
          await expect(productCard).toBeVisible();
          await expect(productCard.getByRole("group", { name: "Taille" }).getByRole("button", { name: "S" })).toBeVisible();
          await expect(productCard.getByRole("group", { name: "Couleur" }).getByRole("button", { name: "Rouge" })).toBeVisible();

          await responseData(
            await merchantContext.request.put(`/api/merchant/products/${product.productId}`, {
              data: {
                categoryId: category.id,
                title: `Produit E2E ${runId}`,
                description: "Produit fictif servant à valider le parcours complet SunuShop.",
                optionNames: ["Taille", "Couleur"],
                variants: [
                  { id: product.variantId, title: "S · Rouge", attributes: { Taille: "S", Couleur: "Rouge" }, sku: `SKU-S-${runId}`, priceXof: 6500, stock: 4, reserved: 0, lowStockThreshold: 1, active: true },
                  { id: secondVariantId, title: "M · Noir", attributes: { Taille: "M", Couleur: "Noir" }, sku: `SKU-M-${runId}`, priceXof: 6000, stock: 3, reserved: 0, lowStockThreshold: 1, active: true },
                ],
              },
            }),
            200,
          );
          await expect.poll(async () => {
            const catalog = await responseData<{ products: Array<{ id: string; variant: { priceXof: number } }> }>(
              await clientContext.request.get(`/api/storefront?merchant=${merchant.slug}`),
              200,
            );
            return catalog.products.find((item) => item.id === product.productId)?.variant.priceXof;
          }, { timeout: 15_000 }).toBe(6500);
          await liveCatalogPage.reload();
          await expect(productCard.getByText("6 500 F")).toBeVisible({ timeout: 15_000 });
          await liveCatalogPage.close();

          const address = await responseData<{ id: string }>(
            await clientContext.request.post("/api/client/addresses", {
              data: {
                label: "Maison E2E",
                recipientName: "Client E2E",
                phone: "+221770000002",
                region: "Dakar",
                city: "Dakar",
                addressHint: "Adresse fictive Playwright",
                isDefault: true,
              },
            }),
            201,
          );
          expect(address.id).toBeTruthy();

          await responseData(
            await clientContext.request.put("/api/client/cart", {
              data: { variantId: product.variantId, quantity: 2 },
            }),
            200,
          );
          const cart = await responseData<{ items: Array<{ variant_id: string; quantity: number }> }>(
            await clientContext.request.get("/api/client/cart"),
            200,
          );
          expect(cart.items).toContainEqual(expect.objectContaining({ variant_id: product.variantId, quantity: 2 }));

          const insufficient = await clientContext.request.put("/api/client/cart", {
            data: { variantId: product.variantId, quantity: 99 },
          });
          expect(insufficient.status()).toBe(409);

          const idempotencyKey = `e2e-order-${runId}`;
          const orderPayload = {
            recipient: {
              name: "Client E2E",
              phone: "+221770000002",
              region: "Dakar",
              city: "Dakar",
              addressHint: "Adresse fictive Playwright",
            },
            groups: [{
              merchantId: merchant.id,
              deliveryZoneId: zone.zoneId,
              methodKind: "merchant_delivery",
              paymentMethod: "wave_direct",
              items: [{ variantId: product.variantId, quantity: 2 }],
            }],
          };
          const batch = await responseData<{
            batchId: string;
            orders: Array<{ id: string; publicCode: string; totalXof: number }>;
          }>(
            await clientContext.request.post("/api/orders/batch", {
              headers: { "idempotency-key": idempotencyKey },
              data: orderPayload,
            }),
            201,
          );
          created.batchId = batch.batchId;
          created.orderId = batch.orders[0].id;

          const duplicate = await responseData<{ batchId: string }>(
            await clientContext.request.post("/api/orders/batch", {
              headers: { "idempotency-key": idempotencyKey },
              data: orderPayload,
            }),
            201,
          );
          expect(duplicate.batchId).toBe(batch.batchId);
          const declaration = await responseData<{ id: string }>(await clientContext.request.post(`/api/orders/${created.orderId}/payment-declarations`, { data: { channel: "wave", externalReference: `WAVE-ORDER-${runId}`, amountXof: batch.orders[0].totalXof, declaredAt: new Date().toISOString() } }), 201);
          await responseData(await merchantContext.request.patch(`/api/orders/${created.orderId}/payment-declarations`, { data: { declarationId: declaration.id, decision: "confirmed" } }), 200);

          const clientPage = await clientContext.newPage();
          await clientPage.goto("/client");
          await expect(clientPage.getByRole("heading", { name: "Achats, adresses et suivi" })).toBeVisible();
          await expect(clientPage.getByText("Maison E2E")).toBeVisible({ timeout: 15_000 });
          await expect(clientPage.getByText(batch.orders[0].publicCode)).toBeVisible();
        });

        await test.step("le tiroir panier affiche l’article, son badge et survit à une navigation", async () => {
          const cartPage = await clientContext.newPage();
          await cartPage.goto("/marche");
          await expect(cartPage.getByLabel(/Ouvrir le panier/)).toBeVisible();
          await cartPage.getByLabel(/Ouvrir le panier/).click();
          await expect(cartPage.getByRole("dialog", { name: "Panier" })).toBeVisible();
          await expect(cartPage.getByText(`Produit E2E ${runId}`)).toBeVisible();
          await cartPage.goto("/marche");
          await expect(cartPage.getByLabel(/Ouvrir le panier \(\d+ articles?\)/)).toBeVisible();
          await cartPage.close();
        });

        await test.step("le marchand prépare la commande et invite son livreur", async () => {
          for (const status of ["confirmed", "preparing", "ready_for_handoff"] as const) {
            await responseData(
              await merchantContext.request.post(`/api/orders/${created.orderId}/status`, {
                data: { status, publicMessage: `E2E : ${status}` },
              }),
              200,
            );
          }

          const invitation = await responseData<{ id: string }>(
            await merchantContext.request.post("/api/merchant/couriers", {
              data: {
                merchantId: merchant.id,
                email: emails.courier,
                displayName: "Livreur E2E",
                phone: "+221770000003",
                vehicleType: "motorbike",
                vehicleRegistration: `DK-${runId.slice(-6)}`,
              },
            }),
            201,
          );
          const { data: notification, error: notificationError } = await admin
            .from("notification_outbox")
            .select("payload")
            .eq("dedupe_key", `courier-invitation:${invitation.id}`)
            .single();
          if (notificationError) throw notificationError;
          const invitationUrl = String((notification.payload as JsonObject).url);
          const connectionUrl = new URL(invitationUrl);
          const nextPath = connectionUrl.searchParams.get("next");
          const token = nextPath
            ? new URL(nextPath, connectionUrl.origin).searchParams.get("token")
            : null;
          expect(token).toBeTruthy();

          await signIn(courierContext, emails.courier);
          await responseData(
            await courierContext.request.post("/api/invitations/claim", { data: { token } }),
            200,
          );

          const { data: courierMembership, error: courierError } = await admin
            .from("courier_memberships")
            .select("id, email, vehicle_type, vehicle_registration")
            .eq("merchant_id", merchant.id)
            .eq("courier_user_id", courierUserId)
            .single();
          if (courierError) throw courierError;
          expect(courierMembership).toMatchObject({ email: emails.courier, vehicle_type: "motorbike" });

          const assigned = await responseData<{ id: string; status: string; pickupCode?: string }>(
            await merchantContext.request.post("/api/merchant/deliveries", {
              data: { orderId: created.orderId, courierMembershipId: courierMembership.id },
            }),
            201,
          );
          expect(assigned.pickupCode).toBeUndefined();

          const forbidden = await clientContext.request.get(
            `/api/merchant/deliveries?merchantId=${merchant.id}`,
          );
          expect(forbidden.status()).toBe(403);

          await responseData(
            await courierContext.request.post(`/api/deliveries/${assigned.id}/status`, {
              data: { status: "accepted" },
            }),
            200,
          );
          await responseData(
            await courierContext.request.post(`/api/deliveries/${assigned.id}/status`, {
              data: { status: "at_pickup" },
            }),
            200,
          );

          const courierMissions = await responseData<{ items: Array<{ id: string; pickupCode: string | null }> }>(
            await courierContext.request.get("/api/deliveries/mine"),
            200,
          );
          const pickupCode = courierMissions.items.find((item) => item.id === assigned.id)?.pickupCode;
          expect(pickupCode).toMatch(/^\d{6}$/);
          const merchantDeliveries = await responseData<{ items: Array<Record<string, unknown>> }>(
            await merchantContext.request.get(`/api/merchant/deliveries?merchantId=${merchant.id}`),
            200,
          );
          expect(merchantDeliveries.items.find((item) => item.id === assigned.id)).not.toHaveProperty("pickupCode");

          const wrongPickup = await merchantContext.request.post(
            `/api/deliveries/${assigned.id}/verify/pickup`,
            { data: { code: pickupCode === "000000" ? "000001" : "000000" } },
          );
          expect(wrongPickup.status()).toBe(422);
          const courierCannotValidatePickup = await courierContext.request.post(`/api/deliveries/${assigned.id}/verify/pickup`, { data: { code: pickupCode } });
          expect(courierCannotValidatePickup.status()).toBe(404);
          for (let attempt = 1; attempt < 5; attempt += 1) {
            const rejected = await merchantContext.request.post(`/api/deliveries/${assigned.id}/verify/pickup`, { data: { code: pickupCode === "000000" ? "000001" : "000000" } });
            expect(rejected.status()).toBe(422);
          }
          const lockedPickup = await merchantContext.request.post(`/api/deliveries/${assigned.id}/verify/pickup`, { data: { code: pickupCode } });
          expect(lockedPickup.status()).toBe(429);
          await responseData(await merchantContext.request.patch(`/api/deliveries/${assigned.id}/code-attempts`, { data: {} }), 200);
          await responseData(
            await merchantContext.request.post(`/api/deliveries/${assigned.id}/verify/pickup`, {
              data: { code: pickupCode },
            }),
            200,
          );
          await responseData(
            await courierContext.request.post(`/api/deliveries/${assigned.id}/status`, {
              data: { status: "in_transit" },
            }),
            200,
          );

          const clientOrder = await responseData<{
            order: { status: string };
            delivery: { recipientCode: string };
          }>(await clientContext.request.get(`/api/orders/${created.orderId}`), 200);
          expect(clientOrder.order.status).toBe("in_transit");
          expect(clientOrder.delivery.recipientCode).toMatch(/^\d{6}$/);
          expect(clientOrder.delivery.recipientCode).not.toBe(pickupCode);
          const merchantCannotValidateRecipient = await merchantContext.request.post(`/api/deliveries/${assigned.id}/verify/recipient`, { data: { code: clientOrder.delivery.recipientCode } });
          expect(merchantCannotValidateRecipient.status()).toBe(404);

          const wrongRecipient = await courierContext.request.post(
            `/api/deliveries/${assigned.id}/verify/recipient`,
            { data: { code: clientOrder.delivery.recipientCode === "999999" ? "999998" : "999999" } },
          );
          expect(wrongRecipient.status()).toBe(422);
          await responseData(
            await courierContext.request.post(`/api/deliveries/${assigned.id}/verify/recipient`, {
              data: { code: clientOrder.delivery.recipientCode },
            }),
            200,
          );

          const history = await responseData<{
            items: Array<{ id: string; status: string; recipient: JsonObject }>;
            stats: { deliveredThisMonth: number };
          }>(await courierContext.request.get("/api/deliveries/mine"), 200);
          const delivered = history.items.find((item) => item.id === assigned.id);
          expect(delivered).toMatchObject({
            status: "delivered",
            recipient: { name: null, phone: null, addressHint: null, city: "Dakar", region: "Dakar" },
          });
          expect(history.stats.deliveredThisMonth).toBeGreaterThanOrEqual(1);

          const courierPage = await courierContext.newPage();
          await courierPage.goto("/marchand");
          await expect(courierPage.getByRole("heading", { name: "Mon activité de livraison" })).toBeVisible();
          await expect(courierPage.getByText("Livrée")).toBeVisible();

          const finalOrder = await responseData<{
            order: { status: string };
            delivery: { recipientCode: string | null };
          }>(await clientContext.request.get(`/api/orders/${created.orderId}`), 200);
          expect(finalOrder.order.status).toBe("delivered");
          expect(finalOrder.delivery.recipientCode).toBeNull();

          const loyalty = await responseData<{
            accounts: Array<{ merchant_id: string; availablePoints: number }>;
          }>(await clientContext.request.get("/api/client/loyalty"), 200);
          const loyaltyAccount = loyalty.accounts.find((account) => account.merchant_id === merchant.id);
          expect(loyaltyAccount?.availablePoints ?? 0).toBe(0);
          const loyaltyQuote = await responseData<{
            groups: Array<{ merchantId: string; pointsApplied: number; loyaltyDiscountXof: number; totalXof: number }>;
          }>(await clientContext.request.post("/api/cart/quote", { data: { groups: [{ merchantId: merchant.id, deliveryZoneId: zone.zoneId, applyLoyalty: true, items: [{ variantId: product.variantId, quantity: 1 }] }] } }), 200);
          expect(loyaltyQuote.groups[0]).toMatchObject({ pointsApplied: 0, loyaltyDiscountXof: 0 });
          await responseData(await merchantContext.request.patch("/api/merchant/couriers", { data: { merchantId: merchant.id, membershipId: courierMembership.id, displayName: "Livreur E2E", phone: "+221770000003", vehicleType: "motorbike", vehicleRegistration: `DK-${runId.slice(-6)}`, status: "inactive" } }), 200);
          const inactiveProfile = await responseData<{ items: Array<{ id: string; status: string; stats: { deliveredTotal: number } }> }>(await merchantContext.request.get(`/api/merchant/couriers?merchantId=${merchant.id}`), 200);
          expect(inactiveProfile.items.find((item) => item.id === courierMembership.id)).toMatchObject({ status: "inactive", stats: { deliveredTotal: 1 } });
        });
      });
    } finally {
      await Promise.all([merchantContext.close(), clientContext.close(), courierContext.close()]);
    }

    expect(clientUserId).toBeTruthy();
  });

  test("candidature → invitation → justificatifs KYC → envoi du dossier", async ({ browser }) => {
    test.setTimeout(150_000);
    const onboardingEmail = `e2e-onboarding-${runId}@example.test`;
    const publicContext = await browser.newContext();
    const lead = await responseData<{ id: string }>(await publicContext.request.post("/api/candidatures/marchands", { data: {
      contactName: "Fatou Test", shopName: `Commerce dossier ${runId}`, email: onboardingEmail,
      phone: "+221770000009", city: "Dakar", businessType: "informal", salesChannel: "Boutique physique",
      categories: ["Mode"], message: "Dossier KYC fictif Playwright.", consent: true,
    } }), 201);
    created.leadIds.push(lead.id);

    const arbitrarySignup = await publicContext.request.post("/api/auth/password/sign-up", { data: { email: `blocked-${runId}@example.test`, password, next: "/marchand" } });
    expect(arbitrarySignup.status()).toBe(403);
    await publicContext.close();

    const { data: invitation, error: invitationError } = await admin
      .from("workspace_invitations")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("kind", "merchant_owner")
      .eq("status", "pending")
      .single();
    if (invitationError) throw invitationError;
    created.invitationIds.push(invitation.id);
    const { data: invitationNotification, error: notificationError } = await admin
      .from("notification_outbox")
      .select("payload")
      .eq("dedupe_key", `merchant-invitation:${invitation.id}`)
      .single();
    if (notificationError) throw notificationError;
    const invitationUrl = new URL(String((invitationNotification.payload as JsonObject).url));
    const nextPath = invitationUrl.searchParams.get("next");
    const token = nextPath ? new URL(nextPath, invitationUrl.origin).searchParams.get("token") : null;
    expect(token).toBeTruthy();

    const ownerId = await createUser(onboardingEmail, "Fatou Test");

    const ownerContext = await browser.newContext();
    await signIn(ownerContext, onboardingEmail);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/marchand");
    await expect(ownerPage.getByText(/dossier commerçant est prêt/i)).toBeVisible();
    await ownerPage.getByRole("link", { name: "Ouvrir mon espace" }).click();
    const { data: ownerMembership, error: ownerMembershipError } = await admin
      .from("merchant_members").select("merchant_id").eq("user_id", ownerId).eq("role", "owner").single();
    if (ownerMembershipError) throw ownerMembershipError;
    const merchantId = ownerMembership.merchant_id;
    created.merchantIds.push(merchantId);
    const { data: draftCategory, error: draftCategoryError } = await admin
      .from("categories")
      .select("id")
      .eq("active", true)
      .limit(1)
      .single();
    if (draftCategoryError) throw draftCategoryError;
    await responseData(await ownerContext.request.post("/api/merchant/products", { data: {
      merchantId, categoryId: draftCategory.id, title: "Brouillon avant KYC",
      description: "Produit préparé pendant la vérification du dossier.", sku: `DRAFT-${runId}`, priceXof: 1000, stock: 1, publish: false,
    } }), 201);

    // Un paiement actif ouvre tout le dashboard même si le dossier KYC reste
    // en cours. C'est le parcours réel de BUSINESS KALI.
    const activeUntil = new Date(Date.now() + 30 * 86_400_000);
    const { error: activateMerchantError } = await admin
      .from("merchant_accounts")
      .update({ status: "active", subscription_status: "active" })
      .eq("id", merchantId);
    if (activateMerchantError) throw activateMerchantError;
    const { error: subscriptionError } = await admin.from("merchant_subscriptions").insert({
      merchant_id: merchantId,
      plan_id: "essential",
      status: "active",
      starts_at: new Date().toISOString(),
      current_period_ends_at: activeUntil.toISOString(),
      grace_ends_at: new Date(activeUntil.getTime() + 3 * 86_400_000).toISOString(),
    });
    if (subscriptionError) throw subscriptionError;
    await ownerPage.reload();
    await expect(ownerPage.getByRole("heading", { name: "Vue d’ensemble" })).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: /^Produits/ })).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: /^Livreurs/ })).toBeVisible();
    await ownerPage.getByRole("button", { name: "terminez-le ici" }).evaluate((button) => (button as HTMLButtonElement).click());
    await expect(ownerPage.getByRole("heading", { name: "Dossier marchand" })).toBeVisible();
    await expect(ownerPage.getByText("Obligatoire", { exact: true })).toHaveCount(4);
    await expect(ownerPage.getByText("Facultatif", { exact: true })).toHaveCount(1);

    const { data: verificationCase, error: caseError } = await admin.from("verification_cases").select("id").eq("merchant_id", merchantId).single();
    if (caseError) throw caseError;
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
    await ownerPage.getByLabel("Ajouter CNI recto").setInputFiles({ name: "national_id_front.pdf", mimeType: "application/pdf", buffer: pdf });
    await expect(ownerPage.getByLabel("Remplacer CNI recto")).toHaveCount(1, { timeout: 20_000 });
    for (const documentType of ["national_id_back", "proof_activity"]) {
      await responseData(await ownerContext.request.post(`/api/merchant/verifications/${verificationCase.id}/documents`, { multipart: { documentType, file: { name: `${documentType}.pdf`, mimeType: "application/pdf", buffer: pdf } } }), 201);
    }

    await test.step("le marchand remplit la lettre d’intention en ligne au lieu de scanner un document papier", async () => {
      await ownerPage.getByRole("button", { name: "Remplir la lettre d’intention en ligne" }).click();
      await ownerPage.getByLabel("Nom complet du signataire").fill("Fatou Test");
      await ownerPage.getByLabel("Date de naissance").fill("1990-01-15");
      await ownerPage.getByLabel("Numéro de pièce").fill("1234567890123");
      await ownerPage.getByLabel("Qualité (ex. Propriétaire, Gérant)").fill("Propriétaire");
      await ownerPage.getByLabel("Activité principale et catégories de produits proposées").fill("Vente de vêtements traditionnels et accessoires artisanaux.");
      await ownerPage.getByLabel("Fait à (lieu de signature)").fill("Dakar");
      const certificationCheckbox = ownerPage.getByLabel(
        "Je certifie sur l’honneur l’exactitude des déclarations ci-dessus.",
      );
      const generateIntentLetterButton = ownerPage.getByRole("button", {
        name: "Générer et enregistrer ma lettre d’intention",
      });

      await certificationCheckbox.check({ force: true });
      await expect(certificationCheckbox).toBeChecked();
      await expect(generateIntentLetterButton).toBeEnabled();
      await generateIntentLetterButton.click();
      await expect(ownerPage.getByText("Lettre d’intention enregistrée")).toBeVisible({ timeout: 15_000 });
      await expect(ownerPage.getByRole("button", { name: "Voir le PDF" })).toBeVisible();
      await expect(ownerPage.getByRole("button", { name: "Télécharger le PDF" })).toBeVisible();
      await ownerPage.getByRole("button", { name: "Fermer", exact: true }).click({ force: true });
      await expect(ownerPage.getByRole("button", { name: "Voir ou télécharger ma lettre" })).toBeVisible();
    });

    const { data: intentLetterDocument, error: intentLetterError } = await admin
      .from("verification_documents")
      .select("id, mime_type")
      .eq("case_id", verificationCase.id)
      .eq("document_type", "intent_letter")
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (intentLetterError) throw intentLetterError;
    expect(intentLetterDocument.mime_type).toBe("application/pdf");
    const intentAccess = await responseData<{ viewUrl: string; downloadUrl: string; version: number }>(
      await ownerContext.request.get(`/api/merchant/verifications/${verificationCase.id}/documents/${intentLetterDocument.id}/download`),
      200,
    );
    expect(intentAccess.viewUrl).toContain("/storage/v1/object/sign/");
    expect(intentAccess.downloadUrl).toContain("download");

    const { data: storedDocuments } = await admin.from("verification_documents").select("storage_path").eq("case_id", verificationCase.id);
    created.verificationPaths.push(...(storedDocuments ?? []).map((document) => document.storage_path));
    await responseData(await ownerContext.request.post(`/api/merchant/verifications/${verificationCase.id}/submit`, { data: {} }), 200);
    const { data: submitted } = await admin.from("verification_cases").select("status").eq("id", verificationCase.id).single();
    expect(submitted?.status).toBe("submitted");

    const approvedAt = new Date().toISOString();
    const { error: approvalError } = await admin.from("verification_cases").update({ status: "approved", decided_at: approvedAt }).eq("id", verificationCase.id);
    if (approvalError) throw approvalError;
    const { error: merchantApprovalError } = await admin.from("merchant_accounts").update({ verification_status: "approved" }).eq("id", merchantId);
    if (merchantApprovalError) throw merchantApprovalError;
    const { error: leadConversionError } = await admin.from("crm_leads").update({ status: "converted", converted_at: approvedAt }).eq("id", lead.id);
    if (leadConversionError) throw leadConversionError;
    await ownerPage.reload();
    await expect(ownerPage.getByRole("heading", { name: `Commerce dossier ${runId}` })).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: /^Produits/ })).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: /^Livreurs/ })).toBeVisible();
    await ownerContext.close();
  });

  test("les métriques analytics admin exigent une authentification et un rôle admin", async ({ browser }) => {
    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.request.get(
      "/api/admin/analytics?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z",
    );
    expect(anonymous.status()).toBe(401);
    await anonymousContext.close();

    const clientEmail = `e2e-analytics-client-${runId}@example.test`;
    await createUser(clientEmail, "Client sans rôle admin");
    const clientContext = await browser.newContext();
    await signIn(clientContext, clientEmail);
    const forbidden = await clientContext.request.get(
      "/api/admin/analytics?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z",
    );
    expect(forbidden.status()).toBe(403);
    await clientContext.close();
  });
});
