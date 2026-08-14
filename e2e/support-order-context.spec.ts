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
  merchant: `e2e-support-merchant-${runId}@example.test`,
  client: `e2e-support-client-${runId}@example.test`,
};

const created = {
  userIds: [] as string[],
  merchantId: "",
  orderId: "",
  batchId: "",
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
  if (error || !data.user) throw error ?? new Error(`Utilisateur non créé : ${email}`);
  created.userIds.push(data.user.id);
  return data.user.id;
}

test.afterAll(async () => {
  if (created.orderId) {
    await admin.from("messages").delete().in(
      "conversation_id",
      (await admin.from("conversations").select("id").eq("order_id", created.orderId)).data?.map((c) => c.id) ?? [],
    );
    await admin.from("conversations").delete().eq("order_id", created.orderId);
    await admin.from("order_items").delete().eq("order_id", created.orderId);
    await admin.from("orders").delete().eq("id", created.orderId);
  }
  if (created.batchId) await admin.from("order_batches").delete().eq("id", created.batchId);
  for (const userId of created.userIds) {
    await admin.from("messages").delete().eq("sender_id", userId);
    await admin.from("conversations").delete().eq("buyer_id", userId);
  }
  if (created.merchantId) {
    await admin.from("merchant_members").delete().eq("merchant_id", created.merchantId);
    await admin.from("merchant_accounts").delete().eq("id", created.merchantId);
  }
  for (const userId of created.userIds.reverse()) {
    await admin.auth.admin.deleteUser(userId);
  }
});

test.describe.serial("commande liée au support et identité épinglée", () => {
  test("le client choisit une commande à l'ouverture du support, le marchand voit son identité", async ({ browser }) => {
    test.setTimeout(180_000);

    const merchantUserId = await createUser(emails.merchant, "Marchand Support E2E");
    const clientUserId = await createUser(emails.client, "Client Support E2E");

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
        public_name: `Boutique Support E2E ${runId}`,
        slug: `boutique-support-e2e-${runId}`,
        description: "Boutique fictive créée et supprimée par Playwright.",
        phone: "+221770000010",
        email: emails.merchant,
        region: "Dakar",
        city: "Dakar",
        address_hint: "Point de retrait E2E",
        pickup_address_line: "Point de retrait E2E, Dakar",
        pickup_latitude: 14.7167,
        pickup_longitude: -17.4677,
        wave_payment_number: "+221770000010",
        status: "active",
        verification_status: "approved",
        subscription_status: "active",
      })
      .select("id, public_name, slug")
      .single();
    if (merchantError) throw merchantError;
    created.merchantId = merchant.id;
    const { error: membershipError } = await admin.from("merchant_members").insert({
      merchant_id: merchant.id,
      user_id: merchantUserId,
      role: "owner",
    });
    if (membershipError) throw membershipError;

    const merchantContext = await browser.newContext();
    const clientContext = await browser.newContext();

    await signIn(merchantContext, emails.merchant);
    await signIn(clientContext, emails.client);

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
          title: `Produit Support E2E ${runId}`,
          slug: `produit-support-e2e-${runId}`,
          description: "Produit fictif servant à valider le support lié aux commandes.",
          sku: `SKU-SUP-${runId}`,
          variantTitle: "Standard",
          priceXof: 5000,
          stock: 5,
          publish: true,
        },
      }),
      201,
    );

    const address = await responseData<{ id: string }>(
      await clientContext.request.post("/api/client/addresses", {
        data: {
          label: "Maison E2E",
          recipientName: "Client Support E2E",
          phone: "+221770000011",
          region: "Dakar",
          city: "Dakar",
          addressHint: "Adresse fictive Playwright",
          latitude: 14.72,
          longitude: -17.45,
          isDefault: true,
        },
      }),
      201,
    );
    expect(address.id).toBeTruthy();

    await responseData(
      await clientContext.request.put("/api/client/cart", {
        data: { variantId: product.variantId, quantity: 1 },
      }),
      200,
    );

    const batch = await responseData<{
      batchId: string;
      orders: Array<{ id: string; publicCode: string; totalXof: number }>;
    }>(
      await clientContext.request.post("/api/orders/batch", {
        headers: { "idempotency-key": `e2e-support-order-${runId}` },
        data: {
          recipient: {
            name: "Client Support E2E",
            phone: "+221770000011",
            region: "Dakar",
            city: "Dakar",
            addressHint: "Adresse fictive Playwright",
            latitude: 14.72,
            longitude: -17.45,
          },
          groups: [{
            merchantId: merchant.id,
            deliveryZoneId: zone.zoneId,
            methodKind: "merchant_delivery",
            paymentMethod: "wave_direct",
            items: [{ variantId: product.variantId, quantity: 1 }],
          }],
        },
      }),
      201,
    );
    created.batchId = batch.batchId;
    created.orderId = batch.orders[0].id;
    const publicCode = batch.orders[0].publicCode;

    await test.step("le client ouvre le support et sélectionne la commande", async () => {
      const clientPage = await clientContext.newPage();
      await clientPage.goto("/aide");
      await clientPage.getByRole("button", { name: "Discuter avec un admin SunuShop" }).click();

      const select = clientPage.getByLabel("Cette demande concerne-t-elle une commande précise ?");
      await expect(select).toBeVisible();
      await expect(select.locator("option", { hasText: publicCode })).toHaveCount(1);
      await select.selectOption(created.orderId);
      await clientPage.getByRole("button", { name: "Continuer" }).click();

      await expect(clientPage).toHaveURL(/\/messages$/, { timeout: 10_000 });
      await expect(clientPage.getByText("Une erreur interne est survenue")).toHaveCount(0);
      await clientPage.close();
    });

    await test.step("la conversation support est bien liée à la commande en base", async () => {
      const { data: conversation, error } = await admin
        .from("conversations")
        .select("id, order_id, subject")
        .eq("buyer_id", clientUserId)
        .eq("kind", "buyer_support")
        .single();
      expect(error).toBeNull();
      expect(conversation?.order_id).toBe(created.orderId);
      expect(conversation?.subject).toContain(publicCode);
    });

    await test.step("le marchand voit un client dans sa messagerie (fil marchand ouvert depuis la commande)", async () => {
      const clientPage2 = await clientContext.newPage();
      await clientPage2.goto(`/commandes/${created.orderId}`);
      await clientPage2.getByRole("button", { name: "Discuter de cette commande" }).click();
      await expect(clientPage2).toHaveURL(/\/messages$/, { timeout: 10_000 });
      await clientPage2.close();

      const merchantPage = await merchantContext.newPage();
      await merchantPage.goto("/marchand");
      await merchantPage.getByRole("button", { name: /Messages/ }).click({ force: true });
      await merchantPage.getByRole("button", { name: /Client Support E2E/ }).click();

      const context = merchantPage.locator(".conversation-context");
      await expect(context).toBeVisible();
      await expect(context).toContainText("Client Support E2E");
      await expect(context).toContainText(emails.client);
      await expect(context).toContainText(publicCode);
      await merchantPage.close();
    });
  });
});
