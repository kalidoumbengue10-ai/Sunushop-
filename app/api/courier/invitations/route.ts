import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("courier_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return apiSuccess({ items: [] }, { requestId });

    const { data, error } = await admin
      .from("courier_memberships")
      .select("id, merchant_id, invited_at, merchant_accounts!inner(public_name, region, city)")
      .eq("courier_profile_id", profile.id)
      .eq("status", "pending_invitation")
      .order("invited_at", { ascending: false });
    if (error) throw error;

    type MerchantRow = { public_name: string; region: string | null; city: string | null };
    const one = <T,>(value: T | T[]) => (Array.isArray(value) ? value[0] : value);
    const items = (data ?? []).map((row) => {
      const merchant = one(row.merchant_accounts as unknown as MerchantRow | MerchantRow[]);
      return {
        id: row.id,
        merchantId: row.merchant_id,
        shopName: merchant?.public_name ?? "Boutique",
        location: [merchant?.city, merchant?.region].filter(Boolean).join(" · "),
        invitedAt: row.invited_at,
      };
    });

    return apiSuccess({ items }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
