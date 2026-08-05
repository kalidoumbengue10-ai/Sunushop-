import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit, getRequestIp, verifyCaptcha } from "@/lib/api/security";
import { merchantLeadApplicationSchema } from "@/lib/domain/schemas";
import { createMerchantOnboardingInvitation } from "@/lib/api/merchant-onboarding";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantLeadApplicationSchema.parse(await request.json());
    const ip = await getRequestIp();
    await Promise.all([
      enforceRateLimit({ key: `ip:${ip}`, action: "merchant_application", windowSeconds: 3_600, maxRequests: 8 }),
      enforceRateLimit({ key: `email:${input.email}`, action: "merchant_application", windowSeconds: 86_400, maxRequests: 3 }),
      verifyCaptcha(input.captchaToken, ip),
    ]);
    const admin = requireAdminClient();
    const { data: existing } = await admin.from("crm_leads").select("id, status, merchant_id").eq("email", input.email).maybeSingle();
    if (existing && (existing.merchant_id || ["converted", "rejected", "archived"].includes(existing.status))) {
      return apiSuccess({
        id: existing.id,
        status: existing.status,
        alreadyKnown: true,
        accountAlreadyCreated: Boolean(existing.merchant_id),
      }, { requestId });
    }
    const values = {
      full_name: input.contactName, business_name: input.shopName, email: input.email,
      phone: input.phone, city: input.city ?? null, business_type: input.businessType,
      sales_channel: input.salesChannel, message: input.message ?? null,
      source: "merchant_application",
      metadata: { categories: input.categories, consent: input.consent, legalName: input.legalName ?? null, submittedVia: "public_application" },
    };
    const result = existing
      ? { data: existing, error: null }
      : await admin.from("crm_leads").insert(values).select("id, status").single();
    if (result.error) throw result.error;
    const recipient = process.env.SUNUSHOP_OPERATIONS_NOTIFICATION_EMAIL?.trim() || process.env.SUNUSHOP_CRM_NOTIFICATION_EMAIL?.trim();
    if (recipient && !existing) {
      const { error } = await admin.from("notification_outbox").insert({
        dedupe_key: `merchant-application:${result.data.id}`, channel: "email",
        template: "merchant_application_received",
        payload: { to: recipient, leadId: result.data.id, contactName: input.contactName, shopName: input.shopName, email: input.email, phone: input.phone },
      });
      if (error) throw error;
    }
    const invitation = await createMerchantOnboardingInvitation({
      admin,
      request,
      leadId: result.data.id,
      email: input.email,
      kind: input.businessType,
      publicName: input.shopName,
      phone: input.phone,
      city: input.city,
      legalName: input.legalName,
    });
    await admin.from("crm_leads").update({ status: "onboarding" }).eq("id", result.data.id);
    return apiSuccess({
      id: result.data.id,
      status: "onboarding",
      alreadyKnown: Boolean(existing),
      invitationEmailSent: invitation.emailSent,
      invitationAlreadyPending: invitation.alreadyPending,
    }, { status: existing ? 200 : 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
