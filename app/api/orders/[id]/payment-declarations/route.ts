import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { directPaymentDecisionSchema, directPaymentDeclarationSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const admin = requireAdminClient();
    const { data: order } = await admin.from("orders").select("public_code, merchant_accounts(email)").eq("id", id).maybeSingle();
    const merchant = Array.isArray(order?.merchant_accounts) ? order?.merchant_accounts[0] : order?.merchant_accounts;
    await enqueueEmail(admin, {
      dedupeKey: `payment-declared:${String(data)}`,
      template: "payment_declared",
      to: merchant?.email,
      payload: { orderCode: order?.public_code, amountXof: input.amountXof, externalReference: input.externalReference, url: new URL(`/commandes/${id}`, request.url).toString() },
    }).catch(() => false);
    return apiSuccess({ id: data }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = directPaymentDecisionSchema.parse(await request.json());
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("review_direct_payment", {
      p_declaration_id: input.declarationId,
      p_decision: input.decision,
      p_rejection_reason: input.rejectionReason ?? null,
    });
    if (error) throw error;
    const admin = requireAdminClient();
    const { data: order } = await admin.from("orders").select("public_code, buyer_id").eq("id", id).maybeSingle();
    if (order) await enqueueEmail(admin, {
      dedupeKey: `payment-reviewed:${input.declarationId}:${input.decision}`,
      template: input.decision === "confirmed" ? "payment_confirmed" : "verification_decision",
      recipientUserId: order.buyer_id,
      payload: { orderCode: order.public_code, statusLabel: input.decision === "confirmed" ? "Paiement confirmé" : "Paiement refusé", message: input.rejectionReason, url: new URL(`/commandes/${id}`, request.url).toString() },
    }).catch(() => false);
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
