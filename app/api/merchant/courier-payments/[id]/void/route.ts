import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { courierPayoutVoidSchema } from "@/lib/domain/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const [{ id }, input, { user }] = await Promise.all([
      context.params,
      request.json().then((body) => courierPayoutVoidSchema.parse(body)),
      requireUser(),
    ]);
    const { data, error } = await requireAdminClient().rpc("void_courier_payout", {
      p_payout_id: id,
      p_reason: input.reason,
      p_actor_id: user.id,
    });
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
