import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

loadEnvConfig(process.cwd());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Configuration Supabase E2E absente.");
const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const captureDir = resolve(process.cwd(), "reports", "e2e", "courier");
mkdirSync(captureDir, { recursive: true });

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post("/api/auth/password/sign-in", { data: { email, password } });
  expect(response.status(), await response.text()).toBe(200);
}

async function data<T>(response: Awaited<ReturnType<APIRequestContext["post"]>>, expected = 200) {
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(expected);
  return body.data as T;
}

test("offre privée, acceptation idempotente, codes renouvelés et paiement séparé", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Le scénario complet est joué une fois.");
  test.setTimeout(180_000);
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 7)}`;
  const password = `SunuShop-Mission-${crypto.randomUUID()}!`;
  const ownerEmail = `mission-owner-${stamp}@example.test`;
  const clientEmail = `mission-client-${stamp}@example.test`;
  const courierEmail = `mission-courier-${stamp}@example.test`;
  const phone = `+22176${String(Date.now()).slice(-7)}`;
  const contexts: BrowserContext[] = [];
  const userIds: string[] = [];
  let merchantId = "";
  try {
    const [ownerCreated, clientCreated] = await Promise.all([
      admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true }),
      admin.auth.admin.createUser({ email: clientEmail, password, email_confirm: true }),
    ]);
    if (!ownerCreated.data.user || !clientCreated.data.user) throw ownerCreated.error ?? clientCreated.error ?? new Error("Utilisateurs absents");
    userIds.push(ownerCreated.data.user.id, clientCreated.data.user.id);
    const suffix = crypto.randomUUID().slice(0, 8);
    const { data: merchant, error: merchantError } = await admin.from("merchant_accounts").insert({ owner_user_id: ownerCreated.data.user.id, kind: "informal", public_name: `Boutique Mission ${suffix}`, slug: `mission-${suffix}`, phone: "+221770009999", email: ownerEmail, region: "Dakar", city: "Dakar", address_hint: "Plateau", pickup_address_line: "10 avenue Plateau, Dakar", pickup_latitude: 14.669, pickup_longitude: -17.427, pickup_enabled: true, status: "active", verification_status: "approved", subscription_status: "active", wave_payment_number: "+221770009999" }).select("id, public_name").single();
    if (merchantError) throw merchantError;
    merchantId = merchant.id;
    await admin.from("merchant_members").insert({ merchant_id: merchantId, user_id: ownerCreated.data.user.id, role: "owner" });
    const periodEnd = new Date(Date.now() + 30 * 86_400_000);
    await admin.from("merchant_subscriptions").insert({ merchant_id: merchantId, plan_id: "essential", status: "active", starts_at: new Date().toISOString(), current_period_ends_at: periodEnd.toISOString(), grace_ends_at: new Date(periodEnd.getTime() + 3 * 86_400_000).toISOString() });

    const owner = await browser.newContext(); const client = await browser.newContext(); const courier = await browser.newContext();
    contexts.push(owner, client, courier);
    await Promise.all([signIn(owner.request, ownerEmail, password), signIn(client.request, clientEmail, password)]);
    const { data: category } = await admin.from("categories").select("id").eq("active", true).limit(1).single();
    const zone = await data<{ zoneId: string }>(await owner.request.post("/api/merchant/delivery-zones", { data: { merchantId, methodKind: "merchant_delivery", methodName: "Livraison Dakar", region: "Dakar", city: "Dakar", label: "Dakar centre", feeXof: 1800, courierFeeXof: 1500, minDelayMinutes: 30, maxDelayMinutes: 180 } }), 201);
    const product = await data<{ variantId: string }>(await owner.request.post("/api/merchant/products", { data: { merchantId, categoryId: category!.id, title: `Colis ${suffix}`, slug: `colis-${suffix}`, description: "Produit de validation du parcours livreur complet.", sku: `E2E-${suffix}`, variantTitle: "Standard", priceXof: 5000, stock: 5, publish: true } }), 201);
    const batch = await data<{ orders: Array<{ id: string; publicCode: string; totalXof: number }> }>(await client.request.post("/api/orders/batch", { headers: { "idempotency-key": `mission-${stamp}` }, data: { recipient: { name: "Awa Diallo", phone: "+221770001234", region: "Dakar", city: "Ouakam", addressHint: "Près du monument", latitude: 14.72, longitude: -17.45 }, groups: [{ merchantId, deliveryZoneId: zone.zoneId, methodKind: "merchant_delivery", paymentMethod: "wave_direct", items: [{ variantId: product.variantId, quantity: 1 }] }] } }), 201);
    const order = batch.orders[0];
    const declaration = await data<{ id: string }>(await client.request.post(`/api/orders/${order.id}/payment-declarations`, { data: { channel: "wave", externalReference: `PAY-${stamp}`, amountXof: order.totalXof, declaredAt: new Date().toISOString() } }), 201);
    await data(await owner.request.patch(`/api/orders/${order.id}/payment-declarations`, { data: { declarationId: declaration.id, decision: "confirmed" } }));
    for (const status of ["confirmed", "preparing", "ready_for_handoff"]) await data(await owner.request.post(`/api/orders/${order.id}/status`, { data: { status, publicMessage: `Commande ${status}` } }));

    const invite = await data<{ membershipId: string; invitationUrl: string }>(await owner.request.post("/api/merchant/couriers", { data: { merchantId, displayName: "Ibrahima Sow", phone, email: courierEmail, vehicleType: "motorbike" } }), 201);
    const token = new URL(invite.invitationUrl).searchParams.get("token");
    await data(await courier.request.post("/api/courier/access/activate", { data: { token } }));
    const { data: profile } = await admin.from("courier_profiles").select("user_id").eq("phone", phone).single();
    userIds.push(profile!.user_id);
    await data(await courier.request.patch("/api/courier/payment-profile", { data: { wavePaymentNumber: phone, orangeMoneyPaymentNumber: null, preferredPaymentChannel: "wave" } }));

    const staleOffer = await data<{ id: string }>(await owner.request.post("/api/merchant/delivery-offers", { data: { orderId: order.id, courierMembershipId: invite.membershipId, courierFeeXof: 1650, idempotencyKey: `stale-offer-${order.id}` } }), 201);
    await admin.from("delivery_offers").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", staleOffer.id);
    const reassignmentQueue = await data<{ items: Array<{ id: string; reassignment: boolean }> }>(await owner.request.get(`/api/merchant/assignable-orders?merchantId=${merchantId}`));
    expect(reassignmentQueue.items.find((item) => item.id === order.id)).toMatchObject({ reassignment: true });
    const { data: expiredOffer } = await admin.from("delivery_offers").select("status").eq("id", staleOffer.id).single();
    expect(expiredOffer?.status).toBe("expired");

    const offer = await data<{ id: string; courier_fee_xof: number }>(await owner.request.post("/api/merchant/delivery-offers", { data: { orderId: order.id, courierMembershipId: invite.membershipId, courierFeeXof: 1650, idempotencyKey: `offer-${order.id}` } }), 201);
    expect(offer.courier_fee_xof).toBe(1650);
    const offers = await (await courier.request.get("/api/courier/delivery-offers")).json();
    expect(offers.data.items[0]).toMatchObject({ id: offer.id, shopName: merchant.public_name, zone: "Dakar centre", courierFeeXof: 1650, distanceMeters: 6400, durationSeconds: 1080 });
    expect(JSON.stringify(offers.data.items[0])).not.toContain("Awa Diallo");
    expect(JSON.stringify(offers.data.items[0])).not.toContain("+221770001234");
    const courierPage = await courier.newPage();
    await courierPage.setViewportSize({ width: 393, height: 852 });
    await courierPage.goto("/marchand?mode=missions");
    await expect(courierPage.getByRole("button", { name: "Accepter la mission" })).toBeVisible({ timeout: 15_000 });
    await courierPage.screenshot({ path: resolve(captureDir, "mission-offer-mobile-393.png"), fullPage: true });

    const accepted = await data<{ deliveryId: string }>(await courier.request.post(`/api/courier/delivery-offers/${offer.id}/decision`, { data: { decision: "accept" } }));
    const acceptedAgain = await data<{ deliveryId: string }>(await courier.request.post(`/api/courier/delivery-offers/${offer.id}/decision`, { data: { decision: "accept" } }));
    expect(acceptedAgain.deliveryId).toBe(accepted.deliveryId);
    let mine = (await (await courier.request.get("/api/deliveries/mine")).json()).data;
    const mission = mine.items.find((item: { id: string }) => item.id === accepted.deliveryId);
    expect(mission.recipient).toMatchObject({ name: "Awa Diallo", phone: "+221770001234" });
    expect(mission.courier_fee_xof).toBe(1650);
    await courierPage.reload();
    await expect(courierPage.getByText("Awa Diallo")).toBeVisible();
    await expect(courierPage.getByText("Au retrait, montrez ce code au marchand")).toBeVisible();
    await expect(courierPage.getByRole("button", { name: "Je suis arrivé au retrait" })).toHaveCount(0);
    await courierPage.screenshot({ path: resolve(captureDir, "mission-accepted-mobile-393.png"), fullPage: true });

    mine = (await (await courier.request.get("/api/deliveries/mine")).json()).data;
    const pickupCode = mine.items.find((item: { id: string }) => item.id === accepted.deliveryId).pickupCode;
    expect(pickupCode).toMatch(/^\d{6}$/);
    await data(await owner.request.post(`/api/deliveries/${accepted.deliveryId}/verify/pickup`, { data: { code: pickupCode } }));
    const clientOrder = await data<{ delivery: { recipientCode: string } }>(await client.request.get(`/api/orders/${order.id}`));
    const oldCode = clientOrder.delivery.recipientCode as string;
    const renewed = await data<{ code: string }>(await client.request.post(`/api/orders/${order.id}/delivery-code/resend`));
    expect(renewed.code).not.toBe(oldCode);
    const oldAttempt = await courier.request.post(`/api/deliveries/${accepted.deliveryId}/verify/recipient`, { data: { code: oldCode } });
    expect(oldAttempt.status()).toBe(422);
    await data(await courier.request.post(`/api/deliveries/${accepted.deliveryId}/verify/recipient`, { data: { code: renewed.code } }));
    mine = (await (await courier.request.get("/api/deliveries/mine")).json()).data;
    const completed = mine.items.find((item: { id: string }) => item.id === accepted.deliveryId);
    expect(completed.status).toBe("delivered");
    expect(completed.recipient).toMatchObject({ name: null, phone: null, addressHint: null, latitude: null, longitude: null });

    const payout = await data<{ id: string }>(await owner.request.post("/api/merchant/courier-payments", { data: { merchantId, courierMembershipId: invite.membershipId, deliveryIds: [accepted.deliveryId], paymentMethod: "wave", externalReference: `WAVE-${stamp}`, paidAt: new Date().toISOString() } }), 201);
    await data(await courier.request.post(`/api/courier/payouts/${payout.id}/decision`, { data: { decision: "confirmed" } }));
    const { data: stored } = await admin.from("deliveries").select("courier_fee_xof, courier_payment_status").eq("id", accepted.deliveryId).single();
    expect(stored).toMatchObject({ courier_fee_xof: 1650, courier_payment_status: "paid" });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    if (merchantId) await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: merchantId });
    for (const userId of [...new Set(userIds)].reverse()) await admin.auth.admin.deleteUser(userId);
  }
});
