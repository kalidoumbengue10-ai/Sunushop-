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
  buyerA: `e2e-secreg-buyerA-${runId}@example.test`,
  buyerB: `e2e-secreg-buyerB-${runId}@example.test`,
};

const created = {
  userIds: [] as string[],
  merchantId: "",
  categoryId: "",
  batchId: "",
  productId: "",
  variantId: "",
  orderId: "",
};

async function responseJson(response: APIResponse) {
  return (await response.json().catch(() => null)) as { data?: unknown; error?: { code?: string; message?: string } } | null;
}

async function signIn(context: BrowserContext, email: string) {
  const response = await context.request.post("/api/auth/password/sign-in", { data: { email, password } });
  expect(response.status(), JSON.stringify(await responseJson(response))).toBe(200);
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
  if (created.orderId) {
    await admin.from("order_items").delete().eq("order_id", created.orderId);
    await admin.from("order_events").delete().eq("order_id", created.orderId);
    await admin.from("orders").delete().eq("id", created.orderId);
  }
  // order_batches.buyer_id est "on delete restrict" : un batch orphelin
  // (créé mais dont l'insertion de la commande a échoué plus loin dans le
  // setup) bloque silencieusement deleteUser sans qu'aucune "orders" ne le
  // révèle. Toujours purgé indépendamment de orderId (incident vécu lors de
  // l'écriture de ce spec : 6 comptes E2E laissés bloqués par ce trou).
  if (created.batchId) await admin.from("order_batches").delete().eq("id", created.batchId);
  if (created.variantId) await admin.from("inventory_items").delete().eq("variant_id", created.variantId);
  if (created.productId) {
    await admin.from("product_variants").delete().eq("product_id", created.productId);
    await admin.from("products").delete().eq("id", created.productId);
  }
  if (created.merchantId) {
    await admin.from("merchant_members").delete().eq("merchant_id", created.merchantId);
    await admin.from("merchant_accounts").delete().eq("id", created.merchantId);
  }
  for (const userId of created.userIds.reverse()) {
    await admin.auth.admin.deleteUser(userId);
  }
}

test.describe.serial("régressions de sécurité — audit backend 2026-08", () => {
  test.afterAll(cleanup);

  test.beforeAll(async () => {
    await createUser(emails.buyerA, "Acheteur A E2E");
    await createUser(emails.buyerB, "Acheteur B E2E");

    const { data: category } = await admin.from("categories").select("id").eq("slug", "autres-produits").single();
    created.categoryId = category!.id;

    const { data: merchant, error: merchantError } = await admin
      .from("merchant_accounts")
      .insert({
        owner_user_id: created.userIds[0],
        kind: "informal",
        public_name: `Boutique SecReg ${runId}`,
        slug: `boutique-secreg-${runId}`,
        phone: "+221770000100",
        email: `merchant-secreg-${runId}@example.test`,
        status: "active",
        subscription_status: "active",
        pickup_enabled: true,
        pickup_address_line: "Dakar",
        pickup_latitude: 14.7167,
        pickup_longitude: -17.4677,
        region: "Dakar",
        city: "Dakar",
      })
      .select("id")
      .single();
    if (merchantError) throw merchantError;
    created.merchantId = merchant.id;

    const { data: product, error: productError } = await admin
      .from("products")
      .insert({
        merchant_id: created.merchantId,
        category_id: created.categoryId,
        title: `Produit SecReg ${runId}`,
        slug: `produit-secreg-${runId}`,
        description: "Produit de test pour la régression IDOR.",
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
        product_id: created.productId,
        merchant_id: created.merchantId,
        sku: `SKU-SECREG-${runId}`,
        attributes: {},
        active: true,
        price_xof: 5000,
      })
      .select("id")
      .single();
    if (variantError) throw variantError;
    created.variantId = variant.id;

    await admin.from("inventory_items").insert({ variant_id: created.variantId, available_quantity: 10, reserved_quantity: 0 });

    const { data: batch, error: batchError } = await admin
      .from("order_batches")
      .insert({
        buyer_id: created.userIds[0],
        public_code: `SECREG-BATCH-${runId}`,
        idempotency_key: `secreg-idem-${runId}`,
        order_count: 1,
        total_xof: 5000,
      })
      .select("id")
      .single();
    if (batchError) throw batchError;
    created.batchId = batch.id;

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        batch_id: batch.id,
        buyer_id: created.userIds[0],
        merchant_id: created.merchantId,
        public_code: `SECREG-${runId}`,
        status: "pending_seller_confirmation",
        payment_method: "cash_on_delivery",
        payment_status: "pending",
        subtotal_xof: 5000,
        delivery_fee_xof: 0,
        total_xof: 5000,
        delivery_snapshot: { methodKind: "pickup" },
        recipient_snapshot: { displayName: "Acheteur A E2E", phone: "+221770000100" },
      })
      .select("id")
      .single();
    if (orderError) throw orderError;
    created.orderId = order.id;
  });

  test("IDOR : l'acheteur B ne peut pas lire la commande de l'acheteur A (RLS, pas juste l'API)", async ({ browser }) => {
    // Couche applicative : la route /api/orders/[id] utilise le client
    // utilisateur (RLS active), pas le client admin — donc ce test, s'il
    // échoue, révèle un trou RLS et pas seulement un bug de vérification
    // applicative manquante.
    const contextB = await browser.newContext();
    await signIn(contextB, emails.buyerB);
    const response = await contextB.request.get(`/api/orders/${created.orderId}`);
    const body = await responseJson(response);
    // La ligne n'existe pas pour B (RLS) : la route doit renvoyer 404,
    // jamais 500 ni fuiter le contenu de la commande d'un autre acheteur.
    expect(response.status(), JSON.stringify(body)).toBe(404);
    expect(JSON.stringify(body)).not.toContain("SECREG");
    await contextB.close();

    // Vérification RLS directe, sans passer par la route API : seul ce test
    // prouve que la RLS tient plutôt que la couche applicative. `orders`
    // n'est même pas accordée à `anon` (grant select ... to authenticated
    // uniquement, voir 202607290003_rls_storage.sql) : le test s'authentifie
    // donc comme acheteur B pour exercer la vraie policy orders_participant_read
    // plutôt qu'un refus de grant qui masquerait la question posée.
    const anonAsB = createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await anonAsB.auth.signInWithPassword({ email: emails.buyerB, password });
    expect(signInError).toBeNull();
    const { data: rows, error } = await anonAsB.from("orders").select("id").eq("id", created.orderId);
    expect(error).toBeNull();
    expect(rows).toEqual([]);
    await anonAsB.auth.signOut();
  });

  test("IDOR : l'acheteur A peut lire sa propre commande", async ({ browser }) => {
    const contextA = await browser.newContext();
    await signIn(contextA, emails.buyerA);
    const response = await contextA.request.get(`/api/orders/${created.orderId}`);
    const body = await responseJson(response);
    expect(response.status(), JSON.stringify(body)).toBe(200);
    await contextA.close();
  });

  test("commande inexistante : 404 générique, jamais 500 ni message SQL (piège .single())", async ({ browser }) => {
    const contextA = await browser.newContext();
    await signIn(contextA, emails.buyerA);
    const response = await contextA.request.get(`/api/orders/00000000-0000-4000-8000-000000000000`);
    const body = await responseJson(response);
    expect(response.status(), JSON.stringify(body)).toBe(404);
    const raw = JSON.stringify(body);
    expect(raw.toLowerCase()).not.toContain("pgrst");
    expect(raw.toLowerCase()).not.toContain("postgres");
    await contextA.close();
  });

  test("régression I1 : injection de métacaractères PostgREST via region/city/query rejetée en 400 (route réelle)", async ({ request }) => {
    const injected = "x),or(status.eq.suspended";
    const storefront = await request.get(`/api/storefront?region=${encodeURIComponent(injected)}`);
    expect(storefront.status()).toBe(400);
    const search = await request.get(`/api/search?query=${encodeURIComponent(injected)}`);
    expect(search.status()).toBe(400);
    // Le trafic légitime continue de fonctionner après le correctif.
    const legit = await request.get(`/api/storefront?region=${encodeURIComponent("Dakar")}&limit=1`);
    expect(legit.status()).toBe(200);
  });

  test("brute-force PIN livreur : le compte se verrouille après plusieurs tentatives (rate-limit)", async ({ request }) => {
    const phone = "+221770000199";
    let lastStatus = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await request.post("/api/courier/access/sign-in", { data: { phone, pin: "000000" } });
      lastStatus = response.status();
      if (lastStatus === 429) break;
    }
    // Le rate-limit par téléphone (8/15min, lib/api/security.ts) doit finir
    // par déclencher un 429 avant d'épuiser la fenêtre, indépendamment du
    // fait que ce numéro n'a pas de compte réel.
    expect(lastStatus).toBe(429);
  });
});
