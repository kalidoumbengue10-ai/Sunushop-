import { ApiError } from "@/lib/api/errors";
import { protectPasswordAuthRequest } from "@/lib/api/password-auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { signInWithPasswordSchema } from "@/lib/domain/schemas";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = signInWithPasswordSchema.parse(await request.json());
    await protectPasswordAuthRequest({
      email: input.email,
      action: "password_sign_in",
      captchaToken: input.captchaToken,
    });

    const supabase = await getServerSupabase();
    if (!supabase) {
      throw new ApiError(
        503,
        "SUPABASE_NOT_CONFIGURED",
        "La connexion est momentanément indisponible.",
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
      options: { captchaToken: input.captchaToken },
    });

    if (error || !data.user) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Email ou mot de passe incorrect.",
      );
    }

    return apiSuccess({ authenticated: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
