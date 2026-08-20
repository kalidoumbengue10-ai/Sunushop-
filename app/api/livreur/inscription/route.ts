import { ApiError } from "@/lib/api/errors";
import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit, getRequestIp, verifyCaptcha } from "@/lib/api/security";
import { courierFastTrackSignupSchema } from "@/lib/domain/schemas";
import { normalizeMerchantPhone } from "@/lib/api/merchant-onboarding";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = courierFastTrackSignupSchema.parse(await request.json());
    const ip = await getRequestIp();

    // Comme pour le parcours commerçant : sans confirmation d'email ni jeton
    // d'invitation, le CAPTCHA est la seule barrière anti-abus restante.
    await Promise.all([
      enforceRateLimit({ key: `ip:${ip}`, action: "courier_fast_track", windowSeconds: 3_600, maxRequests: 5 }),
      enforceRateLimit({ key: `email:${input.email}`, action: "courier_fast_track", windowSeconds: 86_400, maxRequests: 3 }),
      verifyCaptcha(input.captchaToken, ip),
    ]);

    const admin = requireAdminClient();
    const supabase = await getServerSupabase();
    if (!supabase) {
      throw new ApiError(503, "SUPABASE_NOT_CONFIGURED", "La création de compte est momentanément indisponible.");
    }

    // 1. Compte pré-confirmé : le livreur est utilisable immédiatement.
    const { error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { profile: "courier" },
    });
    if (createError) {
      const alreadyExists =
        createError.code === "email_exists" ||
        /already been registered|already registered|email_exists/i.test(createError.message ?? "");
      if (!alreadyExists) throw createError;
    }

    // 2. Session serveur (cookies posés sur le client lié aux cookies).
    const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (signInError || !signedIn.user) {
      throw new ApiError(
        409,
        "ACCOUNT_ALREADY_EXISTS",
        "Un compte existe déjà avec cette adresse. Connectez-vous avec votre mot de passe actuel ou utilisez « J’ai oublié mon mot de passe ».",
      );
    }
    const userId = signedIn.user.id;

    // 3. Profil livreur (ré-entrée idempotente si le compte existait déjà).
    const { data: existingProfile } = await admin
      .from("courier_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    let courierId: string;
    if (existingProfile) {
      courierId = existingProfile.id;
      const { error: updateError } = await admin
        .from("courier_profiles")
        .update({
          display_name: input.displayName,
          phone: normalizeMerchantPhone(input.phone),
          vehicle_type: input.vehicleType,
          vehicle_registration: input.vehicleRegistration ?? null,
        })
        .eq("id", courierId);
      if (updateError) throw updateError;
    } else {
      const { data: profile, error: profileError } = await admin
        .from("courier_profiles")
        .insert({
          user_id: userId,
          display_name: input.displayName,
          email: input.email,
          phone: normalizeMerchantPhone(input.phone),
          vehicle_type: input.vehicleType,
          vehicle_registration: input.vehicleRegistration ?? null,
        })
        .select("id")
        .single();
      if (profileError) throw profileError;
      courierId = profile.id;
    }

    // 4. Dossier de vérification en cours de constitution.
    const { data: existingCase } = await admin
      .from("courier_verification_cases")
      .select("id")
      .eq("courier_id", courierId)
      .order("submission_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    let caseId = existingCase?.id ?? null;
    if (!caseId) {
      const { data: created, error: caseError } = await admin
        .from("courier_verification_cases")
        .insert({ courier_id: courierId, submission_version: 1 })
        .select("id")
        .single();
      if (caseError) throw caseError;
      caseId = created.id;
    }

    return apiSuccess({ courierId, caseId }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
