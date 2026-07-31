import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    const { data, error } = await admin.rpc("refresh_subscription_states");
    if (error) throw error;
    return apiSuccess({ changed: data ?? 0 }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
