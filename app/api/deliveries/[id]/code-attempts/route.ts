import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const admin = requireAdminClient();
    const { data: delivery, error } = await admin.from("deliveries").select("id, merchant_id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!delivery) throw new ApiError(404, "DELIVERY_NOT_FOUND", "Livraison introuvable.");
    const { data: membership } = await supabase
      .from("merchant_members")
      .select("role")
      .eq("merchant_id", delivery.merchant_id)
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["owner", "manager"])
      .maybeSingle();
    if (!membership) throw new ApiError(403, "FORBIDDEN", "Seul un responsable peut réinitialiser les essais.");
    const { error: updateError } = await admin.from("deliveries").update({ pickup_code_attempts: 0 }).eq("id", id);
    if (updateError) throw updateError;
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: delivery.merchant_id,
      action: "delivery.code.reset",
      entity_type: "delivery",
      entity_id: id,
      request_id: requestId,
      metadata: { stage: "pickup" },
    });
    return apiSuccess({ id, attempts: 0 }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
