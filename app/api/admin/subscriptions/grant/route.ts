import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { subscriptionGrantSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = subscriptionGrantSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["admin"]);
    const { data, error } = await supabase.rpc("admin_grant_subscription", {
      p_merchant_id: input.merchantId,
      p_plan_id: input.planId,
      p_days: input.days,
      p_reason: input.reason,
    });
    if (error) throw error;

    const admin = requireAdminClient();
    const { data: merchant } = await admin
      .from("merchant_accounts")
      .select("owner_user_id, email, public_name")
      .eq("id", input.merchantId)
      .maybeSingle();
    const subscription = data as { id: string; current_period_ends_at: string };

    if (merchant) {
      await enqueueEmail(admin, {
        dedupeKey: `subscription-grant-email:${subscription.id}:${subscription.current_period_ends_at}`,
        template: "subscription_activated",
        to: merchant.email,
        recipientUserId: merchant.owner_user_id,
        payload: {
          shopName: merchant.public_name,
          planName: input.planId,
          currentPeriodEndsAt: subscription.current_period_ends_at,
          url: new URL("/marchand", request.url).toString(),
        },
        sendImmediately: true,
      }).catch(() => false);
    }

    return apiSuccess({ subscription: data }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
