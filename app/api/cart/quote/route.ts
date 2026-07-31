import { requireAdminClient } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { cartQuoteSchema } from "@/lib/domain/schemas";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = cartQuoteSchema.parse(await request.json());
    const repository = new SupabaseCatalogRepository(requireAdminClient());
    const groups = await repository.quote(input.groups);
    return apiSuccess(
      {
        groups,
        totalXof: groups.reduce((total, group) => total + group.totalXof, 0),
        quotedAt: new Date().toISOString(),
      },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
