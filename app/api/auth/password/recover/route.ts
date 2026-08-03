import { ApiError } from "@/lib/api/errors";
import {
  getAuthCallbackUrl,
  protectPasswordAuthRequest,
} from "@/lib/api/password-auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { recoverPasswordSchema } from "@/lib/domain/schemas";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = recoverPasswordSchema.parse(await request.json());
    await protectPasswordAuthRequest({
      email: input.email,
      action: "password_recovery",
      captchaToken: input.captchaToken,
    });

    const supabase = await getServerSupabase();
    if (!supabase) {
      throw new ApiError(
        503,
        "SUPABASE_NOT_CONFIGURED",
        "La récupération du compte est momentanément indisponible.",
      );
    }

    const passwordPage = new URL("/mot-de-passe", "https://sunushop.local");
    if (input.next) passwordPage.searchParams.set("next", input.next);
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: getAuthCallbackUrl(request, `${passwordPage.pathname}${passwordPage.search}`),
      captchaToken: input.captchaToken,
    });

    if (error) {
      throw new ApiError(
        400,
        "RECOVERY_EMAIL_FAILED",
        "L’email de récupération n’a pas pu être envoyé.",
      );
    }

    return apiSuccess({ accepted: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
