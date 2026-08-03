import "server-only";

import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

export type MerchantWorkspaceRole = "owner" | "manager" | "catalog" | "fulfillment" | "finance";

export async function requireApprovedMerchantAccess(
  merchantId: string,
  allowedRoles: MerchantWorkspaceRole[],
) {
  if (!merchantId) throw new ApiError(400, "MERCHANT_REQUIRED", "Boutique requise.");

  const { user, supabase } = await requireUser();
  const admin = requireAdminClient();
  const [{ data: membership, error: membershipError }, { data: merchant, error: merchantError }] =
    await Promise.all([
      admin.from("merchant_members").select("role").eq("merchant_id", merchantId)
        .eq("user_id", user.id).eq("active", true).in("role", allowedRoles).maybeSingle(),
      admin.from("merchant_accounts").select("verification_status").eq("id", merchantId).maybeSingle(),
    ]);

  if (membershipError) throw membershipError;
  if (merchantError) throw merchantError;
  if (!membership) throw new ApiError(403, "FORBIDDEN", "Accès marchand requis.");
  if (merchant?.verification_status !== "approved") {
    throw new ApiError(
      403,
      "KYC_APPROVAL_REQUIRED",
      "Votre dossier doit être validé avant d’accéder aux outils de la boutique.",
    );
  }
  return { user, supabase, admin };
}
