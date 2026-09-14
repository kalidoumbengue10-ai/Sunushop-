import { requireAdminClient } from "@/lib/api/auth";
import { requireFulfillment as requireManager } from "@/lib/api/merchant-guards";
import { normalizeMerchantPhone } from "@/lib/api/merchant-onboarding";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/api/security";
import { courierLookupSchema } from "@/lib/domain/schemas";

// Recherche par correspondance exacte du téléphone : le vivier ne doit jamais
// être parcourable. On renvoie zéro ou un résultat, jamais une liste, et sans
// exposer les coordonnées personnelles du livreur.
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const input = courierLookupSchema.parse({
      merchantId: url.searchParams.get("merchantId") ?? "",
      phone: url.searchParams.get("phone") ?? "",
    });
    const user = await requireManager(input.merchantId);
    // La recherche exacte empêche de parcourir le vivier, mais pas de le
    // balayer : l'espace des numéros sénégalais est petit (préfixes mobiles
    // connus + 7 chiffres) et chaque réponse révèle si une personne est
    // livreur et si son dossier est vérifié. On plafonne donc le débit par
    // compte et par boutique.
    await Promise.all([
      enforceRateLimit({
        key: `user:${user.id}`,
        action: "courier.lookup.user",
        windowSeconds: 3_600,
        maxRequests: 60,
      }),
      enforceRateLimit({
        key: `merchant:${input.merchantId}`,
        action: "courier.lookup.merchant",
        windowSeconds: 86_400,
        maxRequests: 300,
      }),
    ]);
    const admin = requireAdminClient();

    const { data: courier, error } = await admin
      .from("courier_profiles")
      .select("id, display_name, vehicle_type, verification_status")
      .eq("phone", normalizeMerchantPhone(input.phone))
      .maybeSingle();
    if (error) throw error;

    if (!courier || courier.verification_status !== "verified") {
      return apiSuccess({ courier: null, reason: courier ? "not_verified" : "not_found" }, { requestId });
    }

    const { data: membership, error: membershipError } = await admin
      .from("courier_memberships")
      .select("status")
      .eq("merchant_id", input.merchantId)
      .eq("courier_profile_id", courier.id)
      .maybeSingle();
    if (membershipError) throw membershipError;

    return apiSuccess({
      courier: {
        id: courier.id,
        displayName: courier.display_name,
        vehicleType: courier.vehicle_type,
        verified: true,
      },
      linkedStatus: membership?.status ?? null,
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
