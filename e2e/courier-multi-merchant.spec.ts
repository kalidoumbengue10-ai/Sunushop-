import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Configuration Supabase E2E absente.");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post("/api/auth/password/sign-in", { data: { email, password } });
  expect(response.status(), await response.text()).toBe(200);
}

async function merchant(ownerId: string, email: string, suffix: string) {
  const stamp = crypto.randomUUID().slice(0, 8);
  const { data, error } = await admin.from("merchant_accounts").insert({ owner_user_id: ownerId, kind: "informal", public_name: `Boutique ${suffix} ${stamp}`, slug: `courier-${suffix.toLowerCase()}-${stamp}`, phone: "+221771111111", email, region: "Dakar", city: "Dakar", address_hint: "Dakar", pickup_address_line: "Plateau, Dakar", pickup_latitude: 14.669, pickup_longitude: -17.427, pickup_enabled: true, status: "active", verification_status: "approved", subscription_status: "active" }).select("id, public_name").single();
  if (error) throw error;
  const { error: memberError } = await admin.from("merchant_members").insert({ merchant_id: data.id, user_id: ownerId, role: "owner" });
  if (memberError) throw memberError;
  const end = new Date(Date.now() + 30 * 86_400_000);
  const { error: subscriptionError } = await admin.from("merchant_subscriptions").insert({ merchant_id: data.id, plan_id: "essential", status: "active", starts_at: new Date().toISOString(), current_period_ends_at: end.toISOString(), grace_ends_at: new Date(end.getTime() + 3 * 86_400_000).toISOString() });
  if (subscriptionError) throw subscriptionError;
  return data;
}

function invitationToken(invitationUrl: string) {
  return new URL(invitationUrl).searchParams.get("token") ?? "";
}

test("un profil unique ouvre les missions de deux boutiques par lien et les e-mails sont réellement capturés", async ({ browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Le scénario API complet est exécuté une fois ; les tailles sont couvertes séparément.");
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  const password = `SunuShop-E2E-${crypto.randomUUID()}!`;
  const emailA = `courier-owner-a-${stamp}@example.test`;
  const emailB = `courier-owner-b-${stamp}@example.test`;
  const courierEmail = `courier-${stamp}@example.test`;
  const phone = `+22178${String(Date.now()).slice(-7)}`;
  const userIds: string[] = [];
  const merchantIds: string[] = [];
  const contexts: BrowserContext[] = [];
  try {
    await request.delete("http://127.0.0.1:3110/messages");
    const [ownerAResult, ownerBResult] = await Promise.all([
      admin.auth.admin.createUser({ email: emailA, password, email_confirm: true }),
      admin.auth.admin.createUser({ email: emailB, password, email_confirm: true }),
    ]);
    if (ownerAResult.error || ownerBResult.error || !ownerAResult.data.user || !ownerBResult.data.user) throw ownerAResult.error ?? ownerBResult.error ?? new Error("Owners absents");
    userIds.push(ownerAResult.data.user.id, ownerBResult.data.user.id);
    const [shopA, shopB] = await Promise.all([merchant(ownerAResult.data.user.id, emailA, "A"), merchant(ownerBResult.data.user.id, emailB, "B")]);
    merchantIds.push(shopA.id, shopB.id);
    const ownerA = await browser.newContext(); const ownerB = await browser.newContext(); const courier = await browser.newContext();
    contexts.push(ownerA, ownerB, courier);
    await Promise.all([signIn(ownerA.request, emailA, password), signIn(ownerB.request, emailB, password)]);

    const first = await ownerA.request.post("/api/merchant/couriers", { data: { merchantId: shopA.id, displayName: "Moussa Ndiaye", phone, email: courierEmail, vehicleType: "motorbike" } });
    expect(first.status(), await first.text()).toBe(201);
    const firstData = (await first.json()).data as { membershipId: string; invitationUrl: string; emailSent: boolean };
    const firstCaptured = await (await request.get("http://127.0.0.1:3110/messages")).json();
    expect(firstData.emailSent, JSON.stringify({ firstData, firstCaptured })).toBe(true);
    const firstToken = invitationToken(firstData.invitationUrl);
    const preview = await courier.request.get(`/api/courier/access/invitation?token=${firstToken}`);
    expect((await preview.json()).data.shopName).toBe("Boutique A");
    const activation = await courier.request.post("/api/courier/access/activate", { data: { token: firstToken } });
    expect(activation.status(), await activation.text()).toBe(200);
    expect((await courier.request.get(`/api/courier/access/invitation?token=${firstToken}`)).status()).toBe(410);

    const second = await ownerB.request.post("/api/merchant/couriers", { data: { merchantId: shopB.id, displayName: "Moussa Ndiaye", phone, email: courierEmail } });
    expect(second.status(), await second.text()).toBe(201);
    const secondData = (await second.json()).data as { membershipId: string; invitationUrl: string };
    const secondToken = invitationToken(secondData.invitationUrl);
    const secondPreview = await courier.request.get(`/api/courier/access/invitation?token=${secondToken}`);
    expect((await secondPreview.json()).data.shopName).toBe("Boutique B");
    const resent = await ownerB.request.post(`/api/merchant/couriers/${secondData.membershipId}/invitation`, { data: { merchantId: shopB.id } });
    expect(resent.status(), await resent.text()).toBe(200);
    const resentToken = invitationToken(((await resent.json()).data as { invitationUrl: string }).invitationUrl);
    expect((await courier.request.get(`/api/courier/access/invitation?token=${secondToken}`)).status()).toBe(410);
    const secondActivation = await courier.request.post("/api/courier/access/activate", { data: { token: resentToken } });
    expect(secondActivation.status(), await secondActivation.text()).toBe(200);

    const { data: profiles } = await admin.from("courier_profiles").select("id, user_id").eq("phone", phone);
    expect(profiles).toHaveLength(1);
    userIds.push(profiles![0].user_id);
    const { data: memberships } = await admin.from("courier_memberships").select("merchant_id, status").eq("courier_profile_id", profiles![0].id);
    expect(memberships).toEqual(expect.arrayContaining([{ merchant_id: shopA.id, status: "active" }, { merchant_id: shopB.id, status: "active" }]));

    const failurePhone = `+22175${String(Date.now()).slice(-7)}`;
    const failedEmail = `email-failure-${stamp}@example.test`;
    const failedInvite = await ownerA.request.post("/api/merchant/couriers", { data: { merchantId: shopA.id, displayName: "Échec Email", phone: failurePhone, email: failedEmail } });
    expect(failedInvite.status(), await failedInvite.text()).toBe(201);
    const failedData = (await failedInvite.json()).data;
    expect(failedData.emailSent).toBe(false);
    expect(failedData.invitation.emailStatus).toBe("failed");
    expect(failedData.invitation.invitationUrl).toContain("/livreur/invitation?token=");
    const { data: failedProfile } = await admin.from("courier_profiles").select("user_id").eq("phone", failurePhone).single();
    userIds.push(failedProfile!.user_id);
    const messages = await (await request.get("http://127.0.0.1:3110/messages")).json() as { messages: Array<{ to: string[]; text: string }> };
    expect(messages.messages.filter((message) => message.to.includes(courierEmail))).toHaveLength(3);
    expect(messages.messages[0].text).toContain("Ouvrir mes missions");
    expect(messages.messages[0].text).toContain("/livreur/invitation?token=");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    for (const merchantId of merchantIds.reverse()) await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: merchantId });
    for (const userId of [...new Set(userIds)].reverse()) await admin.auth.admin.deleteUser(userId);
  }
});
