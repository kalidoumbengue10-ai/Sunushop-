import { ApiError } from "@/lib/api/errors";
import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit, getRequestIp, verifyCaptcha } from "@/lib/api/security";
import { merchantFastTrackSignupSchema } from "@/lib/domain/schemas";
import { createPublicSlug } from "@/lib/domain/public-slug";
import { normalizeMerchantPhone } from "@/lib/api/merchant-onboarding";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantFastTrackSignupSchema.parse(await request.json());
    const ip = await getRequestIp();

    // Sans confirmation d'email ni jeton d'invitation, le CAPTCHA est la
    // seule barrière anti-abus restante : il est donc obligatoire ici,
    // contrairement au parcours d'authentification générique.
    await Promise.all([
      enforceRateLimit({ key: `ip:${ip}`, action: "merchant_fast_track", windowSeconds: 3_600, maxRequests: 5 }),
      enforceRateLimit({ key: `email:${input.email}`, action: "merchant_fast_track", windowSeconds: 86_400, maxRequests: 3 }),
      verifyCaptcha(input.captchaToken, ip),
    ]);

    const admin = requireAdminClient();
    const supabase = await getServerSupabase();
    if (!supabase) {
      throw new ApiError(503, "SUPABASE_NOT_CONFIGURED", "La création de compte est momentanément indisponible.");
    }

    // 1. Compte pré-confirmé : pas d'email de confirmation à attendre.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { profile: "merchant" },
    });
    let userId = created?.user?.id;
    if (createError) {
      const alreadyExists =
        createError.code === "email_exists" ||
        /already been registered|already registered|email_exists/i.test(createError.message ?? "");
      if (!alreadyExists) throw createError;
      userId = undefined;
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
    userId = signedIn.user.id;

    // 3. Fiche CRM (dédoublonnée par email).
    const { data: existingLead } = await admin
      .from("crm_leads")
      .select("id, merchant_id")
      .eq("email", input.email)
      .maybeSingle();

    const leadValues = {
      full_name: input.contactName,
      business_name: input.shopName,
      email: input.email,
      phone: input.phone,
      city: input.city ?? null,
      business_type: input.businessType,
      sales_channel: input.salesChannel,
      message: input.message ?? null,
      source: "merchant_fast_track",
      status: "onboarding" as const,
      metadata: { categories: input.categories, consent: input.consent, legalName: input.legalName ?? null, submittedVia: "fast_track" },
    };

    const leadId = existingLead
      ? existingLead.id
      : (
          await admin.from("crm_leads").insert(leadValues).select("id").single()
        ).data?.id;
    if (!leadId) throw new ApiError(500, "INTERNAL_ERROR", "La fiche prospect n’a pas pu être créée.");

    // 4. Boutique + dossier de vérification (ré-entrée idempotente si le
    //    compte existait déjà avec une boutique).
    let merchantId: string;
    const { data: existingMembership } = await admin
      .from("merchant_members")
      .select("merchant_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .eq("active", true)
      .maybeSingle();

    if (existingMembership) {
      merchantId = existingMembership.merchant_id;
    } else {
      const { data: applicationData, error: applicationError } = await supabase.rpc("create_merchant_application", {
        p_kind: input.businessType,
        p_public_name: input.shopName,
        p_slug: createPublicSlug(input.shopName),
        p_phone: normalizeMerchantPhone(input.phone),
        p_email: input.email,
        p_legal_name: input.legalName ?? null,
        p_city: input.city ?? null,
        p_representative_is_legal_owner: true,
      });
      if (applicationError) throw applicationError;
      merchantId = String((applicationData as { merchantId: string }).merchantId);
    }

    await admin.from("crm_leads").update({ merchant_id: merchantId }).eq("id", leadId);

    const { data: verificationCase } = await admin
      .from("verification_cases")
      .select("id, status")
      .eq("merchant_id", merchantId)
      .order("submission_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 5. Alerte interne (pas un aller-retour utilisateur).
    const recipient = process.env.SUNUSHOP_OPERATIONS_NOTIFICATION_EMAIL?.trim() || process.env.SUNUSHOP_CRM_NOTIFICATION_EMAIL?.trim();
    if (recipient && !existingLead) {
      await admin.from("notification_outbox").insert({
        dedupe_key: `merchant-fast-track:${leadId}`,
        channel: "email",
        template: "merchant_application_received",
        payload: { to: recipient, leadId, contactName: input.contactName, shopName: input.shopName, email: input.email, phone: input.phone },
      });
    }

    return apiSuccess(
      { merchantId, caseId: verificationCase?.id ?? null },
      { status: 201, requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
