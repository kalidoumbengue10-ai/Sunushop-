import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim().slice(0, 120) || undefined;
    const category =
      url.searchParams.get("category")?.trim().slice(0, 80) || undefined;
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") ?? 24)),
    );
    const repository = new SupabaseCatalogRepository(requireAdminClient());
    const items = await repository.list({ query, category, limit });
    return apiSuccess({ items, source: "supabase" }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
