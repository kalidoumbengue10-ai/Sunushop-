import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: memberships, error: membershipError } = await admin.from("courier_memberships").select("id").eq("courier_user_id", user.id).in("status", ["pending_invitation", "active"]);
    if (membershipError) throw membershipError;
    const ids = (memberships ?? []).map((item) => item.id);
    if (!ids.length) return apiSuccess({ items: [] }, { requestId });
    const now = new Date().toISOString();
    const { error: expiryError } = await (admin as any)
      .from("delivery_offers")
      .update({ status: "expired", responded_at: now })
      .in("courier_membership_id", ids)
      .eq("status", "pending")
      .lte("expires_at", now);
    if (expiryError) throw expiryError;
    const { data, error } = await (admin as any)
      .from("delivery_offers")
      .select("id, status, distance_meters, duration_seconds, client_delivery_fee_xof, courier_fee_xof, created_at, expires_at, courier_memberships!inner(id, status), merchant_accounts!inner(public_name, city, region), orders!inner(public_code, merchant_sequence, delivery_snapshot)")
      .in("courier_membership_id", ids)
      .eq("status", "pending")
      .order("created_at");
    if (error) throw error;
    const items = (data ?? []).map((offer: any) => {
      const shop = Array.isArray(offer.merchant_accounts) ? offer.merchant_accounts[0] : offer.merchant_accounts;
      const order = Array.isArray(offer.orders) ? offer.orders[0] : offer.orders;
      return {
        id: offer.id,
        publicCode: order?.public_code,
        merchantSequence: order?.merchant_sequence,
        shopName: shop?.public_name ?? "Boutique",
        zone: String((order?.delivery_snapshot as { zoneLabel?: string } | null)?.zoneLabel ?? "Zone à préciser"),
        distanceMeters: offer.distance_meters,
        durationSeconds: offer.duration_seconds,
        courierFeeXof: offer.courier_fee_xof,
        createdAt: offer.created_at,
        expiresAt: offer.expires_at,
      };
    });
    return apiSuccess({ items }, { requestId });
  } catch (error) { return apiFailure(error, requestId); }
}
