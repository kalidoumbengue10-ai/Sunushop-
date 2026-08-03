import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { categoryInputSchema } from "@/lib/domain/schemas";
import { createPublicSlug } from "@/lib/domain/public-slug";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    await requireAdminRole(["admin"]);
    const { data, error } = await requireAdminClient().from("categories").select("id, name, slug, description, position, active").order("position");
    if (error) throw error; return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) { return apiFailure(error, requestId); }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireAdminRole(["admin"]);
    const input = categoryInputSchema.parse(await request.json());
    const admin = requireAdminClient();
    const values = { name: input.name, slug: input.slug ?? createPublicSlug(input.name), description: input.description ?? null, position: input.position, active: input.active };
    const result = input.id
      ? await admin.from("categories").update(values).eq("id", input.id).select("id, name, slug, active").single()
      : await admin.from("categories").insert(values).select("id, name, slug, active").single();
    if (result.error) throw result.error;
    await admin.from("audit_events").insert({ actor_id: user.id, action: "catalog.category.save", entity_type: "category", entity_id: result.data.id, request_id: requestId });
    return apiSuccess(result.data, { status: input.id ? 200 : 201, requestId });
  } catch (error) { return apiFailure(error, requestId); }
}
