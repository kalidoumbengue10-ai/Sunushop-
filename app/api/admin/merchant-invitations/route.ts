import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { merchantInvitationSchema } from "@/lib/domain/schemas";
import { createMerchantOnboardingInvitation } from "@/lib/api/merchant-onboarding";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantInvitationSchema.parse(await request.json());
    const { user } = await requireAdminRole(["support", "admin"]);
    const admin = requireAdminClient();
    const invitation = await createMerchantOnboardingInvitation({
      admin, request,
      leadId: input.leadId,
      email: input.email,
      kind: input.kind,
      publicName: input.publicName,
      phone: input.phone,
      city: input.city,
      region: input.region,
      legalName: input.legalName,
      invitedBy: user.id,
    });
    if (input.leadId) {
      await admin
        .from("crm_leads")
        .update({ status: "onboarding", last_contacted_at: new Date().toISOString() })
        .eq("id", input.leadId);
    }
    await admin.from("audit_events").insert({
      actor_id: user.id,
      action: "crm.merchant.invite",
      entity_type: "workspace_invitation",
      entity_id: invitation.id,
      request_id: requestId,
      metadata: { email: input.email, leadId: input.leadId ?? null },
    });
    return apiSuccess(invitation, { status: invitation.alreadyPending ? 200 : 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
