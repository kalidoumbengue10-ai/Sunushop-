import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit, getRequestIp, verifyCaptcha } from "@/lib/api/security";
import { prelaunchLeadSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = prelaunchLeadSchema.parse(await request.json());
    const ip = await getRequestIp();
    await Promise.all([
      enforceRateLimit({
        key: `ip:${ip}`,
        action: "prelaunch_lead",
        windowSeconds: 3_600,
        maxRequests: 10,
      }),
      enforceRateLimit({
        key: `email:${input.email}`,
        action: "prelaunch_lead",
        windowSeconds: 86_400,
        maxRequests: 3,
      }),
      verifyCaptcha(input.captchaToken, ip),
    ]);

    const admin = requireAdminClient();
    const { data: existing } = await admin
      .from("crm_leads")
      .select("id, status")
      .eq("email", input.email)
      .maybeSingle();

    const values = {
      full_name: input.contactName,
      business_name: input.shopName,
      email: input.email,
      phone: input.phone,
      city: input.city ?? null,
      business_type: input.categories.join(", ") || null,
      message: input.message ?? null,
      source: "prelaunch_site",
      metadata: { categories: input.categories, consent: input.consent },
      ...(existing?.status === "archived" ? { status: "new" } : {}),
    };
    const result = existing
      ? await admin
          .from("crm_leads")
          .update(values)
          .eq("id", existing.id)
          .select("id, status")
          .single()
      : await admin
          .from("crm_leads")
          .insert(values)
          .select("id, status")
          .single();
    if (result.error) throw result.error;

    const recipient = process.env.SUNUSHOP_CRM_NOTIFICATION_EMAIL?.trim();
    if (recipient && !existing) {
      const { error: notificationError } = await admin
        .from("notification_outbox")
        .insert({
          dedupe_key: `prelaunch:${result.data.id}`,
          channel: "email",
          template: "prelaunch_lead_received",
          payload: {
            to: recipient,
            leadId: result.data.id,
            contactName: input.contactName,
            shopName: input.shopName,
            email: input.email,
            phone: input.phone,
          },
        });
      if (notificationError) throw notificationError;
    }

    return apiSuccess(
      { id: result.data.id, status: result.data.status, alreadyKnown: Boolean(existing) },
      { status: existing ? 200 : 201, requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
