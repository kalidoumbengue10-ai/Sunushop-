import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export const maxDuration = 30;

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    // Agrégation + update en une seule RPC bornée par LIMIT : le filtrage
    // en JavaScript sur toute la table `carts` a été retiré (voir
    // supabase/migrations/202608230001_cron_bounded_operations.sql).
    const { data: markedAbandoned, error } = await admin.rpc("mark_abandoned_carts", {
      p_inactivity_hours: 24,
      p_limit: 500,
    });
    if (error) throw error;

    return apiSuccess({ markedAbandoned: markedAbandoned ?? 0 }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
