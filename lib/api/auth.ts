import "server-only";

import { ApiError } from "./errors";
import {
  getAdminSupabase,
  getServerSupabase,
} from "@/lib/infrastructure/supabase/server";

export async function requireUser() {
  const supabase = await getServerSupabase();
  if (!supabase) {
    throw new ApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase n’est pas encore configuré.",
    );
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Connectez-vous.");
  }

  return { user, supabase };
}

export function requireAdminClient() {
  const admin = getAdminSupabase();
  if (!admin) {
    throw new ApiError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase n’est pas encore configuré.",
    );
  }
  return admin;
}

export async function requireAdminRole(
  allowed: Array<"reviewer" | "support" | "admin">,
) {
  const { user, supabase } = await requireUser();
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.currentLevel !== "aal2") {
    throw new ApiError(
      403,
      "MFA_REQUIRED",
      "Activez la double authentification pour continuer.",
    );
  }

  const { data: roles, error } = await supabase
    .from("admin_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true);

  if (
    error ||
    !roles?.some((entry) =>
      allowed.includes(entry.role as "reviewer" | "support" | "admin"),
    )
  ) {
    throw new ApiError(403, "FORBIDDEN", "Accès administrateur requis.");
  }

  return { user, supabase };
}
