import "server-only";

import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

export async function requireEditableVerificationCase(caseId: string) {
  const { user, supabase } = await requireUser();
  const { data: verificationCase, error: caseError } = await supabase
    .from("verification_cases")
    .select("id, merchant_id, status")
    .eq("id", caseId)
    .single();
  if (caseError) throw caseError;

  if (!["draft", "needs_changes"].includes(verificationCase.status)) {
    throw new ApiError(
      409,
      "VERIFICATION_CASE_LOCKED",
      "Le dossier ne peut plus être modifié.",
    );
  }

  const { data: membership, error: membershipError } = await supabase
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", verificationCase.merchant_id)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "manager"])
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    throw new ApiError(403, "FORBIDDEN", "Accès marchand requis.");
  }

  return { user, verificationCase };
}
