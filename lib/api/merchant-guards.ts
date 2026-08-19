import "server-only";

import { requireAdminClient, requireUser } from "./auth";
import { ApiError } from "./errors";

export async function requireFulfillment(merchantId: string) {
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", merchantId)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "manager", "fulfillment"])
    .maybeSingle();
  if (!data) throw new ApiError(403, "FORBIDDEN", "Accès refusé.");
  const admin = requireAdminClient();
  const { data: merchant, error } = await admin.from("merchant_accounts").select("status").eq("id", merchantId).maybeSingle();
  if (error) throw error;
  if (merchant?.status !== "active") {
    throw new ApiError(403, "MERCHANT_NOT_ACTIVE", "La boutique doit être active pour gérer les livraisons.");
  }
  return user;
}
