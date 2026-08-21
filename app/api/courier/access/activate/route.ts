import { randomBytes } from "node:crypto";
import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit, getRequestIp } from "@/lib/api/security";
import { hashInvitationToken } from "@/lib/domain/invitation-token";
import { courierAccessActivateSchema } from "@/lib/domain/schemas";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = courierAccessActivateSchema.parse(await request.json());
    const ip = await getRequestIp();
    await enforceRateLimit({ key: `ip:${ip}`, action: "courier_link_activate", windowSeconds: 900, maxRequests: 12 });
    const admin = requireAdminClient();
    const { data: invitation, error } = await admin
      .from("workspace_invitations")
      .select("id, merchant_id, courier_membership_id, payload, status, expires_at")
      .eq("token_hash", hashInvitationToken(input.token))
      .eq("kind", "courier")
      .maybeSingle();
    if (error) throw error;
    if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
      throw new ApiError(410, "INVITATION_EXPIRED", "Ce lien a expiré. Demandez au marchand de vous en renvoyer un.");
    }
    if (!invitation.courier_membership_id) throw new ApiError(404, "INVITATION_NOT_FOUND", "Cette invitation est incomplète.");

    const { data: membership, error: membershipError } = await admin
      .from("courier_memberships")
      .select("id, merchant_id, courier_user_id, courier_profile_id, status")
      .eq("id", invitation.courier_membership_id)
      .single();
    if (membershipError) throw membershipError;
    // Un rattachement créé avant l'introduction des profils livreur peut
    // n'avoir aucun courier_profile_id : sans ce garde, la requête suivante
    // échoue en erreur SQL opaque plutôt qu'en message compréhensible.
    if (!membership.courier_profile_id) {
      throw new ApiError(404, "COURIER_PROFILE_MISSING", "Ce profil livreur est incomplet. Demandez au marchand de vous renvoyer une invitation.");
    }
    const { data: profile, error: profileError } = await admin
      .from("courier_profiles")
      .select("id, user_id")
      .eq("id", membership.courier_profile_id)
      .single();
    if (profileError) throw profileError;
    // Le lien personnel est le seul geste demandé au livreur. Un mot de passe
    // aléatoire, jamais affiché ni réutilisé, sert uniquement à créer sa session.
    const password = `SunuShop-${randomBytes(32).toString("base64url")}!`;
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(profile.user_id, { password });
    if (updateAuthError) throw updateAuthError;

    const supabase = await getServerSupabase();
    if (!supabase) throw new ApiError(503, "SUPABASE_NOT_CONFIGURED", "La connexion est momentanément indisponible.");
    const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(profile.user_id);
    if (authLookupError || !authUser.user?.email) throw authLookupError ?? new Error("COURIER_AUTH_EMAIL_MISSING");
    const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email: authUser.user.email, password });
    if (signInError || !signedIn.user) {
      throw new ApiError(401, "COURIER_ACCESS_FAILED", "Ouverture impossible. Demandez un nouveau lien au marchand.");
    }

    const activatedAt = new Date().toISOString();
    const [{ error: profileUpdateError }, { error: membershipUpdateError }, { error: invitationUpdateError }] = await Promise.all([
      admin.from("courier_profiles").update({
        last_access_at: activatedAt,
        verification_status: "verified",
      }).eq("id", profile.id),
      admin.from("courier_memberships").update({
        status: "active",
        accepted_at: activatedAt,
        responded_at: activatedAt,
      }).eq("id", membership.id),
      admin.from("workspace_invitations").update({
        status: "claimed",
        claimed_by: profile.user_id,
        claimed_at: activatedAt,
      }).eq("id", invitation.id).eq("status", "pending"),
    ]);
    if (profileUpdateError) throw profileUpdateError;
    if (membershipUpdateError) throw membershipUpdateError;
    if (invitationUpdateError) throw invitationUpdateError;

    await admin.from("audit_events").insert({
      actor_id: profile.user_id,
      merchant_id: membership.merchant_id,
      action: "courier.invitation.activate",
      entity_type: "courier_membership",
      entity_id: membership.id,
      request_id: requestId,
      metadata: { invitationId: invitation.id },
    });
    return apiSuccess({ authenticated: true, next: "/marchand?mode=missions" }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
