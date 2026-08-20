import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("submit_courier_verification_case", { p_case_id: id });
    if (error) throw error;

    const operationsEmail =
      process.env.SUNUSHOP_OPERATIONS_NOTIFICATION_EMAIL?.trim()
      || process.env.SUNUSHOP_CRM_NOTIFICATION_EMAIL?.trim();
    const submitted = data as { courier_id?: string; submission_version?: number } | null;
    if (operationsEmail && submitted?.courier_id) {
      const admin = requireAdminClient();
      const { data: courier } = await admin
        .from("courier_profiles")
        .select("display_name, phone")
        .eq("id", submitted.courier_id)
        .maybeSingle();
      await enqueueEmail(admin, {
        dedupeKey: `courier-verification-submitted:${id}:${String(submitted.submission_version ?? "current")}`,
        template: "courier_verification_submitted",
        to: operationsEmail,
        payload: { courierName: courier?.display_name, phone: courier?.phone },
      }).catch(() => false);
    }

    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
