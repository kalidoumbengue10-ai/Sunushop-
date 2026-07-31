import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["reviewer", "admin"]);
    const admin = requireAdminClient();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    let visibleQuery = supabase.from("verification_cases").select("id");
    if (status) visibleQuery = visibleQuery.eq("status", status);
    else {
      visibleQuery = visibleQuery.in("status", [
        "submitted",
        "resubmitted",
        "in_review",
        "needs_changes",
      ]);
    }
    const { data: visibleCases, error: visibleError } = await visibleQuery;
    if (visibleError) throw visibleError;
    if (!visibleCases?.length) {
      return apiSuccess({ items: [] }, { requestId });
    }

    let query = admin
      .from("verification_cases")
      .select(
        "id, merchant_id, status, submission_version, submitted_at, review_started_at, decided_at, merchant_accounts!inner(kind, public_name, legal_name, region, city)",
      )
      .in(
        "id",
        visibleCases.map((item) => item.id),
      )
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .limit(100);

    if (status) query = query.eq("status", status);
    else {
      query = query.in("status", [
        "submitted",
        "resubmitted",
        "in_review",
        "needs_changes",
      ]);
    }

    const { data, error } = await query;
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
