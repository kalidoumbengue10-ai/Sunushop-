import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit, getRequestIp } from "@/lib/api/security";
import { normalizeMerchantPhone } from "@/lib/api/merchant-onboarding";
import { courierPinPassword } from "@/lib/domain/courier-access";
import { courierPinSignInSchema } from "@/lib/domain/schemas";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = courierPinSignInSchema.parse(await request.json());
    const phone = normalizeMerchantPhone(input.phone);
    const ip = await getRequestIp();
    await Promise.all([
      enforceRateLimit({ key: `ip:${ip}`, action: "courier_pin_sign_in", windowSeconds: 900, maxRequests: 20 }),
      enforceRateLimit({ key: `phone:${phone}`, action: "courier_pin_sign_in", windowSeconds: 900, maxRequests: 8 }),
    ]);
    const admin = requireAdminClient();
    const { data: profiles, error } = await admin
      .from("courier_profiles")
      .select("id, user_id, pin_configured_at")
      .eq("phone", phone)
      .order("created_at")
      .limit(1);
    if (error) throw error;
    if (!profiles?.[0]?.pin_configured_at) {
      throw new ApiError(401, "COURIER_PIN_INVALID", "Téléphone ou PIN incorrect.");
    }
    const supabase = await getServerSupabase();
    if (!supabase) throw new ApiError(503, "SUPABASE_NOT_CONFIGURED", "La connexion est momentanément indisponible.");
    const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(profiles[0].user_id);
    if (authLookupError || !authUser.user?.email) throw new ApiError(401, "COURIER_PIN_INVALID", "Téléphone ou PIN incorrect.");
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: authUser.user.email, password: courierPinPassword(phone, input.pin) });
    if (signInError || !data.user) throw new ApiError(401, "COURIER_PIN_INVALID", "Téléphone ou PIN incorrect.");
    await admin.from("courier_profiles").update({ last_access_at: new Date().toISOString() }).eq("id", profiles[0].id);
    return apiSuccess({ authenticated: true, next: "/marchand?mode=missions" }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
