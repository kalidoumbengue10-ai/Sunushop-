import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { courierCompensationSchema } from "@/lib/domain/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const [{ id }, input, { user }] = await Promise.all([
      context.params,
      request.json().then((body) => courierCompensationSchema.parse(body)),
      requireUser(),
    ]);
    const { data, error } = await requireAdminClient().rpc(
      "set_failed_delivery_compensation",
      { p_delivery_id: id, p_amount_xof: input.amountXof, p_actor_id: user.id },
    );
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
