import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireAdminRole(["reviewer", "admin"]);
    const admin = requireAdminClient();
    const status = new URL(request.url).searchParams.get("status");

    let query = admin
      .from("courier_verification_cases")
      .select(
        "id, courier_id, status, submission_version, submitted_at, decided_at, courier_profiles!inner(display_name, phone, email, vehicle_type, vehicle_registration)",
      )
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .limit(100);

    query = status ? query.eq("status", status) : query.eq("status", "pending_verification");

    const { data, error } = await query;
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
