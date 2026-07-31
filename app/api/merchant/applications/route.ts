import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { merchantApplicationSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantApplicationSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("create_merchant_application", {
      p_kind: input.kind,
      p_public_name: input.publicName,
      p_slug: input.slug,
      p_phone: input.phone,
      p_email: input.email ?? null,
      p_legal_name: input.legalName ?? null,
      p_region: input.region ?? null,
      p_city: input.city ?? null,
      p_address_hint: input.addressHint ?? null,
      p_representative_is_legal_owner:
        input.representativeIsLegalOwner,
    });
    if (error) throw error;

    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
