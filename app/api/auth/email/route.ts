import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { recoveryEmailSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = recoveryEmailSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { error } = await supabase.auth.updateUser({ email: input.email });
    if (error) throw error;
    return apiSuccess({ confirmationSent: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
