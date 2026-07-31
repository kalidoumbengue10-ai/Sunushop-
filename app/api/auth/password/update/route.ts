import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { updatePasswordSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = updatePasswordSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { error } = await supabase.auth.updateUser({
      password: input.password,
    });

    if (error) {
      throw new ApiError(
        400,
        "PASSWORD_UPDATE_FAILED",
        "Le mot de passe n’a pas pu être modifié.",
      );
    }

    return apiSuccess({ updated: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
