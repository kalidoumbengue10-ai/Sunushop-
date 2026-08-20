import "server-only";

import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

type CourierCaseRow = {
  id: string;
  courier_id: string;
  status: string;
  submitted_at: string | null;
  courier_profiles: { user_id: string; vehicle_type: string | null } | Array<{ user_id: string; vehicle_type: string | null }>;
};

const one = <T,>(value: T | T[]) => (Array.isArray(value) ? value[0] : value);

async function loadCase(caseId: string) {
  const { user, supabase } = await requireUser();
  const { data, error } = await supabase
    .from("courier_verification_cases")
    .select("id, courier_id, status, submitted_at, courier_profiles!inner(user_id, vehicle_type)")
    .eq("id", caseId)
    .single();
  if (error) throw error;
  const verificationCase = data as unknown as CourierCaseRow;
  const profile = one(verificationCase.courier_profiles);
  if (profile?.user_id !== user.id) {
    throw new ApiError(403, "FORBIDDEN", "Accès livreur requis.");
  }
  return { user, verificationCase, vehicleType: profile?.vehicle_type ?? null };
}

export async function requireEditableCourierVerificationCase(caseId: string) {
  const context = await loadCase(caseId);
  // Un dossier déjà soumis et non refusé est figé le temps de la revue.
  if (context.verificationCase.submitted_at && context.verificationCase.status !== "rejected") {
    throw new ApiError(409, "COURIER_VERIFICATION_CASE_LOCKED", "Le dossier ne peut plus être modifié.");
  }
  return context;
}

export async function requireReadableCourierVerificationCase(caseId: string) {
  return loadCase(caseId);
}
