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
  categoryId: "",
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
  if (created.categoryId) await admin.from("categories").delete().eq("id", created.categoryId);
  for (const userId of created.userIds.reverse()) {
    await admin.auth.admin.deleteUser(userId);
  }
}

test.describe.serial("flux authentifiés marketplace", () => {
  test.afterAll(cleanup);

  test("marchand → client → livreur, avec isolation et codes uniques", async ({ browser }) => {
    test.setTimeout(120_000);

    const merchantUserId = await createUser(emails.merchant, "Marchand E2E");
    const clientUserId = await createUser(emails.client, "Client E2E");
    const courierUserId = await createUser(emails.courier, "Livreur E2E");

    const { data: category, error: categoryError } = await admin
      .from("categories")
      .insert({ slug: `e2e-${runId}`, name: `Catégorie E2E ${runId}`, position: 9999 })
      .select("id")
      .single();
    if (categoryError) throw categoryError;
    created.categoryId = category.id;

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
        status: "active",
        verification_status: "approved",
        subscription_status: "active",
      })
      .select("id, public_name")
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

        const storefront = await responseData<{ products: Array<{ id: string }> }>(
          await merchantContext.request.get("/api/storefront"),
          200,
        );
        expect(storefront.products.some((item) => item.id === product.productId)).toBe(true);

        const page = await merchantContext.newPage();
        await page.goto("/marchand");
        await expect(page.getByRole("heading", { name: merchant.public_name })).toBeVisible();
        await page.getByRole("button", { name: "Catalogue" }).click();
        await expect(page.getByText(`Produit E2E ${runId}`)).toBeVisible();

        await test.step("le client enregistre son adresse, synchronise son panier et commande", async () => {
          await signIn(clientContext, emails.client);
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
              paymentMethod: "cash_on_delivery",
              items: [{ variantId: product.variantId, quantity: 2 }],
            }],
          };
          const batch = await responseData<{
            batchId: string;
            orders: Array<{ id: string; publicCode: string }>;
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

          const clientPage = await clientContext.newPage();
          await clientPage.goto("/client");
          await expect(clientPage.getByRole("heading", { name: "Achats, adresses et suivi" })).toBeVisible();
          await expect(clientPage.getByText("Maison E2E")).toBeVisible();
          await expect(clientPage.getByText(batch.orders[0].publicCode)).toBeVisible();
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
            .select("id")
            .eq("merchant_id", merchant.id)
            .eq("courier_user_id", courierUserId)
            .single();
          if (courierError) throw courierError;

          const assigned = await responseData<{ id: string; pickupCode: string }>(
            await merchantContext.request.post("/api/merchant/deliveries", {
              data: { orderId: created.orderId, courierMembershipId: courierMembership.id },
            }),
            201,
          );
          expect(assigned.pickupCode).toMatch(/^\d{6}$/);

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

          const wrongPickup = await courierContext.request.post(
            `/api/deliveries/${assigned.id}/verify/pickup`,
            { data: { code: assigned.pickupCode === "000000" ? "000001" : "000000" } },
          );
          expect(wrongPickup.status()).toBe(422);
          await responseData(
            await courierContext.request.post(`/api/deliveries/${assigned.id}/verify/pickup`, {
              data: { code: assigned.pickupCode },
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
          expect(clientOrder.delivery.recipientCode).not.toBe(assigned.pickupCode);

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
            deliveredThisMonth: number;
          }>(await courierContext.request.get("/api/deliveries/mine"), 200);
          const delivered = history.items.find((item) => item.id === assigned.id);
          expect(delivered).toMatchObject({
            status: "delivered",
            recipient: { name: null, phone: null, addressHint: null, city: "Dakar", region: "Dakar" },
          });
          expect(history.deliveredThisMonth).toBeGreaterThanOrEqual(1);

          const courierPage = await courierContext.newPage();
          await courierPage.goto("/marchand");
          await expect(courierPage.getByRole("heading", { name: "Mes missions de livraison" })).toBeVisible();
          await expect(courierPage.getByText("delivered")).toBeVisible();

          const finalOrder = await responseData<{
            order: { status: string };
            delivery: { recipientCode: string | null };
          }>(await clientContext.request.get(`/api/orders/${created.orderId}`), 200);
          expect(finalOrder.order.status).toBe("delivered");
          expect(finalOrder.delivery.recipientCode).toBeNull();
        });
      });
    } finally {
      await Promise.all([merchantContext.close(), clientContext.close(), courierContext.close()]);
    }

    expect(clientUserId).toBeTruthy();
  });

  test("candidature → invitation → justificatifs KYC → envoi du dossier", async ({ browser }) => {
    test.setTimeout(90_000);
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

    await createUser(onboardingEmail, "Fatou Test");

    const ownerContext = await browser.newContext();
    await signIn(ownerContext, onboardingEmail);
    const claim = await responseData<{ merchantId: string }>(await ownerContext.request.post("/api/invitations/claim", { data: { token } }), 200);
    created.merchantIds.push(claim.merchantId);
    const restrictedProduct = await ownerContext.request.post("/api/merchant/products", { data: {
      merchantId: claim.merchantId, categoryId: crypto.randomUUID(), title: "Interdit avant KYC",
      description: "Ne doit jamais être créé.", sku: `BLOCKED-${runId}`, priceXof: 1000, stock: 1, publish: false,
    } });
    expect(restrictedProduct.status()).toBe(403);
    await expect(restrictedProduct.json()).resolves.toMatchObject({ error: { code: "KYC_APPROVAL_REQUIRED" } });

    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/marchand");
    await expect(ownerPage.getByText("Espace sécurisé · vérification")).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: "Catalogue" })).toHaveCount(0);
    await expect(ownerPage.getByRole("button", { name: "Livreurs" })).toHaveCount(0);

    const { data: verificationCase, error: caseError } = await admin.from("verification_cases").select("id").eq("merchant_id", claim.merchantId).single();
    if (caseError) throw caseError;
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
    for (const documentType of ["national_id_front", "national_id_back", "intent_letter", "proof_activity"]) {
      await responseData(await ownerContext.request.post(`/api/merchant/verifications/${verificationCase.id}/documents`, { multipart: { documentType, file: { name: `${documentType}.pdf`, mimeType: "application/pdf", buffer: pdf } } }), 201);
    }
    const { data: storedDocuments } = await admin.from("verification_documents").select("storage_path").eq("case_id", verificationCase.id);
    created.verificationPaths.push(...(storedDocuments ?? []).map((document) => document.storage_path));
    await responseData(await ownerContext.request.post(`/api/merchant/verifications/${verificationCase.id}/submit`, { data: {} }), 200);
    const { data: submitted } = await admin.from("verification_cases").select("status").eq("id", verificationCase.id).single();
    expect(submitted?.status).toBe("submitted");

    const approvedAt = new Date().toISOString();
    const { error: approvalError } = await admin.from("verification_cases").update({ status: "approved", decided_at: approvedAt }).eq("id", verificationCase.id);
    if (approvalError) throw approvalError;
    const { error: merchantApprovalError } = await admin.from("merchant_accounts").update({ verification_status: "approved" }).eq("id", claim.merchantId);
    if (merchantApprovalError) throw merchantApprovalError;
    const { error: leadConversionError } = await admin.from("crm_leads").update({ status: "converted", converted_at: approvedAt }).eq("id", lead.id);
    if (leadConversionError) throw leadConversionError;
    await ownerPage.reload();
    await expect(ownerPage.getByRole("heading", { name: `Commerce dossier ${runId}` })).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: "Catalogue" })).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: "Livreurs" })).toBeVisible();
    await ownerContext.close();
  });
});
