import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { directPaymentDeclarationSchema } from "@/lib/domain/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = directPaymentDeclarationSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("declare_direct_payment", {
      p_order_id: id,
      p_channel: input.channel,
      p_external_reference: input.externalReference,
      p_amount_xof: input.amountXof,
      p_declared_at: input.declaredAt,
    });
    if (error) throw error;
    return apiSuccess({ id: data }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(
  request: Request,
  _context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const payload = (await request.json()) as { declarationId?: unknown };
    if (typeof payload.declarationId !== "string") {
      throw new ApiError(
        400,
        "DECLARATION_ID_REQUIRED",
        "Identifiant de déclaration manquant.",
      );
    }
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("confirm_direct_payment", {
      p_declaration_id: payload.declarationId,
    });
    if (error) throw error;
    return apiSuccess({ confirmed: true }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
