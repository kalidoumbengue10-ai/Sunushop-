import { ApiError } from "@/lib/api/errors";
import {
  getAuthCallbackUrl,
  protectPasswordAuthRequest,
} from "@/lib/api/password-auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { signUpWithPasswordSchema } from "@/lib/domain/schemas";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = signUpWithPasswordSchema.parse(await request.json());
    await protectPasswordAuthRequest({
      email: input.email,
      action: "password_sign_up",
      captchaToken: input.captchaToken,
    });

    const supabase = await getServerSupabase();
    if (!supabase) {
      throw new ApiError(
        503,
        "SUPABASE_NOT_CONFIGURED",
        "La création de compte est momentanément indisponible.",
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: getAuthCallbackUrl(request, input.next ?? "/client"),
        captchaToken: input.captchaToken,
      },
    });

    if (error) {
      throw new ApiError(
        400,
        "SIGN_UP_FAILED",
        "L’inscription n’a pas pu être finalisée.",
      );
    }

    return apiSuccess(
      {
        confirmationRequired: !data.session,
        authenticated: Boolean(data.session),
      },
      { status: 201, requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
