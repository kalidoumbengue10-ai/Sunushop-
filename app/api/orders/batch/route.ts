import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { orderBatchSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length < 12) {
      throw new ApiError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Une clé d’idempotence est obligatoire.",
      );
    }
    const input = orderBatchSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("create_order_batch", {
      p_idempotency_key: idempotencyKey,
      p_recipient: input.recipient,
      p_groups: input.groups,
    });
    if (error) throw error;
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
