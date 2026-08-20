import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { requireFulfillment as requireManager } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { courierInviteExistingSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = courierInviteExistingSchema.parse(await request.json());
    await requireManager(input.merchantId);
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("create_courier_membership_invitation", {
      p_merchant_id: input.merchantId,
      p_courier_profile_id: input.courierProfileId,
    });
    if (error) throw error;
    const membership = data as { id: string; courier_user_id: string | null } | null;

    // Notification simple : le livreur a déjà un compte, l'invitation apparaît
    // dans son espace. Aucun lien magique, aucun jeton à faire circuler.
    const admin = requireAdminClient();
    const { data: merchant } = await admin
      .from("merchant_accounts")
      .select("public_name")
      .eq("id", input.merchantId)
      .maybeSingle();
    if (membership?.courier_user_id) {
      await enqueueEmail(admin, {
        dedupeKey: `courier-membership-invite:${membership.id}`,
        template: "courier_membership_invite",
        recipientUserId: membership.courier_user_id,
        payload: {
          shopName: merchant?.public_name,
          url: new URL("/marchand?mode=missions", request.url).toString(),
        },
      }).catch(() => false);
    }

    return apiSuccess(membership, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
