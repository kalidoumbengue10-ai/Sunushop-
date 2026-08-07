import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";

// Aperçu avant suppression définitive : nombre de commandes/produits qui
// seront perdus, pour que l'admin confirme en connaissance de cause.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireAdminRole(["admin"]);

    const { data: merchant, error: merchantError } = await supabase
      .from("merchant_accounts")
      .select("id, public_name, slug, status")
      .eq("id", id)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant) throw new ApiError(404, "MERCHANT_NOT_FOUND", "Boutique introuvable.");

    const [{ count: productCount }, { count: orderCount }] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("merchant_id", id),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("merchant_id", id),
    ]);

    return apiSuccess(
      { merchant, productCount: productCount ?? 0, orderCount: orderCount ?? 0 },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

// Suppression définitive : boutique, produits, commandes et paiements liés
// (voir admin_delete_merchant_cascade dans les migrations). Irréversible.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireAdminRole(["admin"]);
    const admin = requireAdminClient();

    const { data: merchant, error: merchantError } = await supabase
      .from("merchant_accounts")
      .select("id, public_name")
      .eq("id", id)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant) throw new ApiError(404, "MERCHANT_NOT_FOUND", "Boutique introuvable.");

    const [{ count: productCount }, { count: orderCount }] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("merchant_id", id),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("merchant_id", id),
    ]);

    // Journalisée AVANT la suppression : merchant_id passe à null via
    // "on delete set null" une fois la boutique effacée, la ligne survit.
    await supabase.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: id,
      action: "admin.merchant.delete",
      entity_type: "merchant_account",
      entity_id: id,
      request_id: requestId,
      metadata: { public_name: merchant.public_name, productCount: productCount ?? 0, orderCount: orderCount ?? 0 },
    });

    const { error: deleteError } = await admin.rpc("admin_delete_merchant_cascade", { p_merchant_id: id });
    if (deleteError) throw deleteError;

    return apiSuccess({ id }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
