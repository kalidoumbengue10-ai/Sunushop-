import { expect, test } from "@playwright/test";
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
const prefix = `e2e-reliability-${runId}`;
const password = `SunuShop-E2E-${crypto.randomUUID()}!`;

const created = {
  userId: "",
  merchantIds: [] as string[],
  productId: "",
  variantId: "",
  cartIds: [] as string[],
  subscriptionIds: [] as string[],
};

async function cleanup() {
  await admin.from("notification_outbox").delete().ilike("dedupe_key", `${prefix}%`);
  if (created.subscriptionIds.length) {
    await admin.from("notification_outbox").delete().in(
      "dedupe_key",
      [
        `subscription-email:${created.subscriptionIds[0]}:subscription_expired:1999-01-01`,
        `subscription-email:${created.subscriptionIds[1]}:subscription_expired:2000-01-01`,
      ],
    );
  }
  if (created.cartIds.length) await admin.from("carts").delete().in("id", created.cartIds);
  if (created.subscriptionIds.length) await admin.from("merchant_subscriptions").delete().in("id", created.subscriptionIds);
  if (created.productId) await admin.from("products").delete().eq("id", created.productId);
  if (created.merchantIds.length) await admin.from("merchant_accounts").delete().in("id", created.merchantIds);
  if (created.userId) await admin.auth.admin.deleteUser(created.userId);
}

test.describe.serial("fiabilité backend — correctifs post-audit", () => {
  test.afterAll(cleanup);

  test.beforeAll(async () => {
    const email = `${prefix}@example.test`;
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Reliability E2E", e2e_run_id: runId },
    });
    if (userError || !userData.user) throw userError ?? new Error("Compte E2E non créé.");
    created.userId = userData.user.id;

    for (const suffix of ["a", "b"]) {
      const { data: merchant, error } = await admin
        .from("merchant_accounts")
        .insert({
          owner_user_id: created.userId,
          kind: "informal",
          public_name: `Reliability ${suffix.toUpperCase()} ${runId}`,
          slug: `${prefix}-${suffix}`,
          phone: suffix === "a" ? "+221770000120" : "+221770000121",
          email,
          status: "active",
          subscription_status: "active",
          pickup_enabled: true,
          pickup_address_line: "Dakar",
          region: "Dakar",
          city: "Dakar",
        })
        .select("id")
        .single();
      if (error) throw error;
      created.merchantIds.push(merchant.id);
    }

    const { data: category, error: categoryError } = await admin
      .from("categories")
      .select("id")
      .eq("slug", "autres-produits")
      .single();
    if (categoryError) throw categoryError;

    const { data: product, error: productError } = await admin
      .from("products")
      .insert({
        merchant_id: created.merchantIds[0],
        category_id: category.id,
        slug: `${prefix}-product`,
        title: "Produit fiabilité",
        description: "Fixture temporaire pour le test des paniers bornés.",
        status: "draft",
      })
      .select("id")
      .single();
    if (productError) throw productError;
    created.productId = product.id;

    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .insert({
        product_id: created.productId,
        merchant_id: created.merchantIds[0],
        sku: `${prefix}-sku`,
        price_xof: 1000,
        active: true,
      })
      .select("id")
      .single();
    if (variantError) throw variantError;
    created.variantId = variant.id;

    const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    for (let index = 0; index < 2; index++) {
      const { data: cart, error: cartError } = await admin
        .from("carts")
        .insert({ buyer_id: created.userId, status: "active", updated_at: staleAt })
        .select("id")
        .single();
      if (cartError) throw cartError;
      created.cartIds.push(cart.id);
      const { error: itemError } = await admin.from("cart_items").insert({
        cart_id: cart.id,
        merchant_id: created.merchantIds[0],
        variant_id: created.variantId,
        quantity: 1,
        created_at: staleAt,
        updated_at: staleAt,
      });
      if (itemError) throw itemError;
    }

    const { data: plan, error: planError } = await admin
      .from("subscription_plans")
      .select("id")
      .eq("active", true)
      .order("position")
      .limit(1)
      .single();
    if (planError) throw planError;

    for (const [index, merchantId] of created.merchantIds.entries()) {
      const periodEnd = index === 0 ? "1999-01-01T00:00:00.000Z" : "2000-01-01T00:00:00.000Z";
      const { data: subscription, error } = await admin
        .from("merchant_subscriptions")
        .insert({ merchant_id: merchantId, plan_id: plan.id, status: "expired", current_period_ends_at: periodEnd })
        .select("id")
        .single();
      if (error) throw error;
      created.subscriptionIds.push(subscription.id);
    }

    await admin.from("notification_outbox").insert({
      dedupe_key: `subscription-email:${created.subscriptionIds[0]}:subscription_expired:1999-01-01`,
      recipient_user_id: created.userId,
      channel: "email",
      template: "subscription_expired",
      payload: { to: email },
      status: "sent",
      processed_at: new Date().toISOString(),
    });
  });

  test("mark_abandoned_carts traite plusieurs lignes sans RETURNING scalaire", async () => {
    const { data, error } = await admin.rpc("mark_abandoned_carts", {
      p_inactivity_hours: 24,
      p_limit: 10,
      p_cart_ids: created.cartIds,
    });
    expect(error).toBeNull();
    expect(data).toBe(2);
    const { data: carts } = await admin.from("carts").select("status").in("id", created.cartIds);
    expect(carts).toHaveLength(2);
    expect(carts?.every((cart) => cart.status === "abandoned")).toBe(true);
  });

  test("deux claims simultanés restent disjoints et un lease expiré est récupéré", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      dedupe_key: `${prefix}-claim-${index}`,
      recipient_user_id: created.userId,
      channel: "email",
      template: "subscription_expired",
      payload: { to: `${prefix}@example.test` },
    }));
    const { error: insertError } = await admin.from("notification_outbox").insert(rows);
    expect(insertError).toBeNull();

    const [first, second] = await Promise.all([
      admin.rpc("claim_notification_outbox", { p_limit: 10, p_dedupe_prefix: `${prefix}-claim-` }),
      admin.rpc("claim_notification_outbox", { p_limit: 10, p_dedupe_prefix: `${prefix}-claim-` }),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    const firstIds = new Set(((first.data ?? []) as Array<{ id: string }>).map((row) => row.id));
    const secondIds = new Set(((second.data ?? []) as Array<{ id: string }>).map((row) => row.id));
    expect(firstIds.size).toBe(10);
    expect(secondIds.size).toBe(10);
    expect([...firstIds].filter((id) => secondIds.has(id))).toHaveLength(0);

    const staleId = [...firstIds][0];
    const { error: staleError } = await admin
      .from("notification_outbox")
      .update({ processing_started_at: new Date(Date.now() - 3 * 60 * 1000).toISOString() })
      .eq("id", staleId);
    expect(staleError).toBeNull();
    const reclaimed = await admin.rpc("claim_notification_outbox", {
      p_limit: 1,
      p_dedupe_prefix: `${prefix}-claim-`,
    });
    expect(reclaimed.error).toBeNull();
    expect(reclaimed.data?.[0]?.id).toBe(staleId);
  });

  test("la déduplication précède le LIMIT du lot d'abonnements", async () => {
    const { data: queued, error } = await admin.rpc("enqueue_due_subscription_notifications", {
      p_dashboard_url: "https://sunushop.fr/marchand",
      p_limit: 1,
    });
    expect(error).toBeNull();
    expect(queued).toBe(1);

    const expectedKey = `subscription-email:${created.subscriptionIds[1]}:subscription_expired:2000-01-01`;
    const { count } = await admin
      .from("notification_outbox")
      .select("id", { count: "exact", head: true })
      .eq("dedupe_key", expectedKey);
    expect(count).toBe(1);
  });
});
