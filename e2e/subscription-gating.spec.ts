import { expect, test, type APIResponse, type BrowserContext } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Les variables Supabase E2E sont absentes.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const password = `SunuShop-E2E-${crypto.randomUUID()}!`;
const emails = {
  merchant: `e2e-gating-merchant-${runId}@example.test`,
  client: `e2e-gating-client-${runId}@example.test`,
};

const created = {
  userIds: [] as string[],
  merchantId: "",
  productId: "",
  variantId: "",
  zoneId: "",
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

async function setSubscriptionStatus(status: "active" | "expired") {
  const { error } = await admin
    .from("merchant_accounts")
    .update({ status: status === "active" ? "active" : "pending", subscription_status: status })
    .eq("id", created.merchantId);
  if (error) throw error;
}

async function cleanup() {
  if (created.variantId) await admin.from("inventory_items").delete().eq("variant_id", created.variantId);
  if (created.productId) {
    await admin.from("product_variants").delete().eq("product_id", created.productId);
    await admin.from("products").delete().eq("id", created.productId);
  }
  if (created.merchantId) {
    await admin.from("delivery_zones").delete().eq("merchant_id", created.merchantId);
    await admin.from("delivery_methods").delete().eq("merchant_id", created.merchantId);
    await admin.from("merchant_subscriptions").delete().eq("merchant_id", created.merchantId);
    await admin.from("subscription_grants").delete().eq("merchant_id", created.merchantId);
    await admin.from("merchant_members").delete().eq("merchant_id", created.merchantId);
    await admin.from("merchant_accounts").delete().eq("id", created.merchantId);
  }
  for (const userId of created.userIds.reverse()) {
    await admin.auth.admin.deleteUser(userId);
  }
}

test.describe.serial("blocage des vendeurs non abonnés", () => {
  test.afterAll(cleanup);

  test("un marchand expiré est bloqué à 4 niveaux, la RLS tient sans API, et la réactivation restaure tout", async ({ browser }) => {
    test.setTimeout(120_000);

    const merchantUserId = await createUser(emails.merchant, "Marchand Gating E2E");
    const clientUserId = await createUser(emails.client, "Client Gating E2E");

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
        public_name: `Boutique Gating E2E ${runId}`,
        slug: `boutique-gating-e2e-${runId}`,
        description: "Boutique fictive pour valider le gating d'abonnement.",
        phone: "+221770000101",
        email: emails.merchant,
        region: "Dakar",
        city: "Dakar",
        address_hint: "Point de retrait E2E",
        status: "active",
        verification_status: "approved",
        subscription_status: "active",
      })
      .select("id, slug, public_name")
      .single();
    if (merchantError) throw merchantError;
    created.merchantId = merchant.id;

    const { error: membershipError } = await admin.from("merchant_members").insert({
      merchant_id: merchant.id,
      user_id: merchantUserId,
      role: "owner",
    });
    if (membershipError) throw membershipError;

    const { data: subscription, error: subscriptionError } = await admin
      .from("merchant_subscriptions")
      .insert({
        merchant_id: merchant.id,
        plan_id: "essential",
        status: "active",
        starts_at: new Date().toISOString(),
        current_period_ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        grace_ends_at: new Date(Date.now() + 33 * 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (subscriptionError) throw subscriptionError;

    const { data: method, error: methodError } = await admin
      .from("delivery_methods")
      .insert({ merchant_id: merchant.id, kind: "merchant_delivery", name: "Livraison E2E" })
      .select("id")
      .single();
    if (methodError) throw methodError;

    const { data: zone, error: zoneError } = await admin
      .from("delivery_zones")
      .insert({
        delivery_method_id: method.id,
        merchant_id: merchant.id,
        region: "Dakar",
        city: "Dakar",
        label: "Dakar E2E",
        fee_xof: 1000,
        min_delay_minutes: 30,
        max_delay_minutes: 120,
      })
      .select("id")
      .single();
    if (zoneError) throw zoneError;
    created.zoneId = zone.id;

    const { data: product, error: productError } = await admin
      .from("products")
      .insert({
        merchant_id: merchant.id,
        category_id: category.id,
        slug: `produit-gating-e2e-${runId}`,
        title: `Produit Gating E2E ${runId}`,
        description: "Produit fictif pour valider le gating d'abonnement.",
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (productError) throw productError;
    created.productId = product.id;

    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .insert({
        product_id: product.id,
        merchant_id: merchant.id,
        sku: `SKU-GATING-${runId}`,
        price_xof: 3000,
      })
      .select("id")
      .single();
    if (variantError) throw variantError;
    created.variantId = variant.id;

    const { error: inventoryError } = await admin
      .from("inventory_items")
      .insert({ variant_id: variant.id, merchant_id: merchant.id, available_quantity: 10 });
    if (inventoryError) throw inventoryError;

    const { error: mediaError } = await admin.from("product_media").insert({
      product_id: product.id,
      merchant_id: merchant.id,
      storage_bucket: "product-media",
      storage_path: `${merchant.id}/${product.id}/catalogue-e2e.png`,
      alt_text: "Produit de contrôle abonnement",
      position: 0,
    });
    if (mediaError) throw mediaError;

    const clientContext = await browser.newContext();
    const merchantContext = await browser.newContext();
    const merchantDb = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      await signIn(clientContext, emails.client);
      await signIn(merchantContext, emails.merchant);
      const { error: merchantSignInError } = await merchantDb.auth.signInWithPassword({
        email: emails.merchant,
        password,
      });
      if (merchantSignInError) throw merchantSignInError;

      // --- Sanity check : tout est visible tant que l'abonnement est actif.
      await test.step("actif : la boutique et le produit sont visibles", async () => {
        const { data: initialState, error: initialStateError } = await admin
          .from("merchant_accounts")
          .select("status, subscription_status")
          .eq("id", merchant.id)
          .single();
        if (initialStateError) throw initialStateError;
        expect(initialState).toMatchObject({ status: "active", subscription_status: "active" });
        const catalog = await responseData<{ items: Array<{ id: string }> }>(
          await clientContext.request.get(`/api/catalog?q=${encodeURIComponent(`Produit Gating E2E ${runId}`)}`),
          200,
        );
        expect(catalog.items.some((item) => item.id === product.id), JSON.stringify(catalog.items)).toBe(true);

        const shop = await clientContext.request.get(`/api/shops/${merchant.slug}`);
        expect(shop.status()).toBe(200);
      });

      // --- On fait expirer l'abonnement (equivalent à refresh_subscription_states
      // après grace_ends_at) : status repasse à 'pending', subscription_status à 'expired'.
      await setSubscriptionStatus("expired");
      await admin.from("merchant_subscriptions").update({ status: "expired" }).eq("id", subscription.id);

      await test.step("1. boutique expirée absente du catalogue et de /marche", async () => {
        const catalog = await responseData<{ items: Array<{ id: string }> }>(
          await clientContext.request.get(`/api/catalog?q=${encodeURIComponent(`Produit Gating E2E ${runId}`)}`),
          200,
        );
        expect(catalog.items.some((item) => item.id === product.id)).toBe(false);

        const storefront = await responseData<{ products: Array<{ id: string }> }>(
          await clientContext.request.get("/api/storefront"),
          200,
        );
        expect(storefront.products.some((item) => item.id === product.id)).toBe(false);
      });

      await test.step("2. /boutiques/{slug} renvoie 404 pour une boutique expirée", async () => {
        const shop = await clientContext.request.get(`/api/shops/${merchant.slug}`);
        expect(shop.status()).toBe(404);

        const page = await clientContext.newPage();
        const response = await page.goto(`/boutiques/${merchant.slug}`);
        expect(response?.status()).toBe(404);
        await page.close();
      });

      await test.step("3. POST /api/orders/batch renvoie MERCHANT_NOT_ORDERABLE", async () => {
        const idempotencyKey = `e2e-gating-order-${runId}`;
        const response = await clientContext.request.post("/api/orders/batch", {
          headers: { "idempotency-key": idempotencyKey },
          data: {
            recipient: {
              name: "Client Gating E2E",
              phone: "+221770000102",
              region: "Dakar",
              city: "Dakar",
              addressHint: "Adresse fictive Playwright",
            },
            groups: [
              {
                merchantId: merchant.id,
                deliveryZoneId: zone.id,
                paymentMethod: "cash_on_delivery",
                items: [{ variantId: variant.id, quantity: 1 }],
              },
            ],
          },
        });
        expect(response.status()).toBe(409);
        const body = await response.json();
        expect(body.error.code).toBe("MERCHANT_NOT_ORDERABLE");
      });

      await test.step("4. publication produit refusée (abonnement inactif)", async () => {
        // La route PATCH /api/merchant/products vérifie subscription_status
        // avant même d'appeler la RPC set_merchant_product_publication : le
        // code observable est SUBSCRIPTION_REQUIRED. La RPC elle-même lève
        // PRODUCT_PUBLICATION_LOCKED comme filet de sécurité si on l'appelle
        // directement (defense-in-depth), ce que ce test vérifie ensuite.
        const response = await merchantContext.request.patch("/api/merchant/products", {
          data: { productId: product.id, publish: true },
        });
        expect(response.status()).toBe(402);
        const body = await response.json();
        expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");

        const { error: rpcError } = await merchantDb.rpc("set_merchant_product_publication", {
          p_product_id: product.id,
          p_publish: true,
        });
        expect(rpcError?.message).toBe("PRODUCT_PUBLICATION_LOCKED");
      });

      await test.step("5. accès direct base avec la clé anon : 0 ligne (RLS)", async () => {
        // C'est le seul test qui prouve que la RLS tient — les autres ne
        // testent que la couche applicative (qui pourrait avoir un bug
        // d'implémentation sans que la RLS elle-même soit en cause).
        const anon = createClient(supabaseUrl!, anonKey!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: rows, error } = await anon
          .from("products")
          .select("id")
          .eq("merchant_id", merchant.id);
        expect(error).toBeNull();
        expect(rows).toEqual([]);

        const { data: merchantRows, error: merchantRowsError } = await anon
          .from("merchant_accounts")
          .select("id")
          .eq("id", merchant.id);
        expect(merchantRowsError).toBeNull();
        expect(merchantRows).toEqual([]);
      });

      await test.step("6. après activation manuelle CRM, tout redevient visible", async () => {
        // Équivalent de admin_grant_subscription, appelée directement via le
        // client service-role (le rôle admin + AAL2 nécessaires pour la
        // route HTTP ne sont pas simulables simplement dans ce test E2E).
        await setSubscriptionStatus("active");
        const now = new Date();
        const { error } = await admin
          .from("merchant_subscriptions")
          .update({
            status: "active",
            starts_at: now.toISOString(),
            current_period_ends_at: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
            grace_ends_at: new Date(now.getTime() + 33 * 86_400_000).toISOString(),
          })
          .eq("id", subscription.id);
        if (error) throw error;

        const catalog = await responseData<{ items: Array<{ id: string }> }>(
          await clientContext.request.get(`/api/catalog?q=${encodeURIComponent(`Produit Gating E2E ${runId}`)}`),
          200,
        );
        expect(catalog.items.some((item) => item.id === product.id)).toBe(true);

        const shop = await clientContext.request.get(`/api/shops/${merchant.slug}`);
        expect(shop.status()).toBe(200);

        // Le gating d'abonnement est levé (ce qui est testé ici) ; la RPC
        // elle-même reste appelable directement, elle ne dépend que du
        // sous-état de subscription_status/status, pas des règles
        // applicatives (photo, variante) propres à la route PATCH.
        const { error: publishError } = await merchantDb.rpc("set_merchant_product_publication", {
          p_product_id: product.id,
          p_publish: true,
        });
        expect(publishError).toBeNull();
      });
    } finally {
      await merchantDb.auth.signOut();
      await Promise.all([clientContext.close(), merchantContext.close()]);
    }

    expect(clientUserId).toBeTruthy();
  });
});
