import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { deliveryDisputeResolutionSchema } from "@/lib/domain/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const [{ id }, input, { user }] = await Promise.all([
      context.params,
      request.json().then((body) => deliveryDisputeResolutionSchema.parse(body)),
      requireAdminRole(["support", "admin"]),
    ]);
    const { data, error } = await requireAdminClient().rpc("resolve_delivery_dispute", {
      p_dispute_id: id,
      p_outcome: input.outcome,
      p_resolution: input.resolution,
      p_actor_id: user.id,
    });
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
