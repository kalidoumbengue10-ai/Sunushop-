import { ApiError } from "@/lib/api/errors";
import { requireAdminClient } from "@/lib/api/auth";
import {
  getAuthCallbackUrl,
  protectPasswordAuthRequest,
} from "@/lib/api/password-auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { signUpWithPasswordSchema } from "@/lib/domain/schemas";
import { hashInvitationToken } from "@/lib/domain/invitation-token";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = signUpWithPasswordSchema.parse(await request.json());

    const nextUrl = new URL(input.next ?? "/client", "https://sunushop.local");
    const invitationToken =
      nextUrl.pathname === "/invitations/claim"
        ? nextUrl.searchParams.get("token")
        : null;
    const isClientDestination =
      nextUrl.pathname === "/" ||
      nextUrl.pathname === "/marche" ||
      nextUrl.pathname.startsWith("/client") ||
      nextUrl.pathname.startsWith("/commandes/");
    if (!isClientDestination) {
      if (!invitationToken) {
        throw new ApiError(
          403,
          "INVITATION_REQUIRED",
          "Les accès commerçant et livreur sont créés uniquement sur invitation.",
        );
      }
      const { data: invitation, error: invitationError } = await requireAdminClient()
        .from("workspace_invitations")
        .select("id")
        .eq("token_hash", hashInvitationToken(invitationToken))
        .eq("email", input.email)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (invitationError || !invitation) {
        throw new ApiError(
          403,
          "INVITATION_REQUIRED",
          "Cette invitation est invalide, expirée ou liée à une autre adresse email.",
        );
      }
    }
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
