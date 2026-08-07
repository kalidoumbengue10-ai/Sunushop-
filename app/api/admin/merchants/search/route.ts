import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["admin"]);
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    let request_ = supabase
      .from("merchant_accounts")
      .select("id, public_name, slug, status, subscription_status")
      .order("public_name")
      .limit(20);
    if (query) {
      request_ = request_.ilike("public_name", `%${query}%`);
    }
    const { data, error } = await request_;
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
