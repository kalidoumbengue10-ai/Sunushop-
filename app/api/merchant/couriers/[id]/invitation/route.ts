import { requireAdminClient } from "@/lib/api/auth";
import { sendCourierInvitation } from "@/lib/api/courier-invitations";
import { ApiError } from "@/lib/api/errors";
import { requireFulfillment } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { z } from "zod";

const resendSchema = z.object({ merchantId: z.uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = resendSchema.parse(await request.json());
    const user = await requireFulfillment(input.merchantId);
    const admin = requireAdminClient();
    const { data: membership, error } = await admin
      .from("courier_memberships")
      .select("id, email, display_name, phone, vehicle_type, vehicle_registration, courier_user_id")
      .eq("id", id)
      .eq("merchant_id", input.merchantId)
      .maybeSingle();
    if (error) throw error;
    if (!membership) throw new ApiError(404, "COURIER_NOT_FOUND", "Livreur introuvable.");
    if (membership.courier_user_id) {
      throw new ApiError(409, "COURIER_ALREADY_ACTIVATED", "Ce livreur a déjà activé son accès.");
    }

    const invitation = await sendCourierInvitation({
      admin,
      request,
      merchantId: input.merchantId,
      membership,
      invitedBy: user.id,
    });
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: input.merchantId,
      action: "courier.invitation.resend",
      entity_type: "courier_membership",
      entity_id: membership.id,
      request_id: requestId,
      metadata: { emailSent: invitation.emailSent },
    });
    return apiSuccess(invitation, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

