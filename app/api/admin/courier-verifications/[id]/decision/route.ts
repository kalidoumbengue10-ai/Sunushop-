import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { courierVerificationDecisionSchema } from "@/lib/domain/schemas";
import { courierVerificationStatusLabels } from "@/lib/domain/courier-verification";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = courierVerificationDecisionSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["reviewer", "admin"]);

    const { data, error } = await supabase.rpc("review_courier_verification_case", {
      p_case_id: id,
      p_outcome: input.outcome,
      p_decision_code: input.decisionCode ?? null,
      p_courier_message: input.courierMessage ?? null,
      p_internal_note: input.internalNote ?? null,
    });
    if (error) throw error;

    const reviewed = data as { courier_id?: string } | null;
    if (reviewed?.courier_id) {
      const admin = requireAdminClient();
      const { data: courier } = await admin
        .from("courier_profiles")
        .select("user_id, email, display_name")
        .eq("id", reviewed.courier_id)
        .maybeSingle();
      if (courier) {
        await enqueueEmail(admin, {
          dedupeKey: `courier-verification-decision:${id}:${input.outcome}`,
          template: "courier_verification_decision",
          to: courier.email ?? undefined,
          recipientUserId: courier.user_id,
          payload: {
            courierName: courier.display_name,
            statusLabel: courierVerificationStatusLabels[input.outcome],
            message: input.courierMessage,
            url: new URL("/marchand?mode=missions", request.url).toString(),
          },
        }).catch(() => false);
      }
    }

    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
