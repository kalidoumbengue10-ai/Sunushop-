import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { subscriptionTestActivationSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = subscriptionTestActivationSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["admin"]);
    const { data, error } = await supabase.rpc("admin_activate_test_subscription", {
      p_merchant_id: input.merchantId,
      p_plan_id: input.planId ?? null,
      p_days: input.days,
    });
    if (error) throw error;

    const admin = requireAdminClient();
    const [{ data: merchant }, { data: plan }] = await Promise.all([
      admin.from("merchant_accounts").select("owner_user_id, email, public_name").eq("id", input.merchantId).single(),
      admin.from("subscription_plans").select("name").eq("id", data.plan_id).single(),
    ]);

    if (merchant) {
      await enqueueEmail(admin, {
        dedupeKey: `test-subscription-email:${data.id}:${data.current_period_ends_at}`,
        template: "subscription_activated",
        to: merchant.email,
        recipientUserId: merchant.owner_user_id,
        payload: {
          shopName: merchant.public_name,
          planName: plan?.name ?? "SunuShop",
          currentPeriodEndsAt: data.current_period_ends_at,
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
