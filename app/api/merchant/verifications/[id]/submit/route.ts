import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("submit_verification_case", {
      p_case_id: id,
    });
    if (error) throw error;
    const operationsEmail = process.env.SUNUSHOP_OPERATIONS_NOTIFICATION_EMAIL?.trim() || process.env.SUNUSHOP_CRM_NOTIFICATION_EMAIL?.trim();
    if (operationsEmail && data?.merchant_id) {
      const admin = requireAdminClient();
      const { data: merchant } = await admin.from("merchant_accounts").select("public_name").eq("id", data.merchant_id).maybeSingle();
      await enqueueEmail(admin, { dedupeKey: `verification-submitted:${id}:${String(data.submission_version ?? "current")}`, template: "verification_submitted", to: operationsEmail, payload: { shopName: merchant?.public_name } }).catch(() => false);
    }
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
