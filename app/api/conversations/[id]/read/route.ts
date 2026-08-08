import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, buyer_id, merchant_id, kind")
      .eq("id", id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation introuvable.");

    const now = new Date().toISOString();
    let readColumn: "buyer_last_read_at" | "merchant_last_read_at" | "admin_last_read_at" | null = null;

    if (conversation.buyer_id === user.id) {
      readColumn = "buyer_last_read_at";
    } else if (conversation.merchant_id) {
      const { data } = await supabase
        .from("merchant_members")
        .select("id")
        .eq("merchant_id", conversation.merchant_id)
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (data) readColumn = "merchant_last_read_at";
    }
    if (!readColumn && conversation.kind === "buyer_support") {
      const { data } = await supabase
        .from("admin_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("active", true)
        .in("role", ["support", "admin"])
        .maybeSingle();
      if (data) readColumn = "admin_last_read_at";
    }
    if (!readColumn) throw new ApiError(403, "FORBIDDEN", "Vous n’avez pas accès à ce fil.");

    const { error } = await supabase.from("conversations").update({ [readColumn]: now }).eq("id", id);
    if (error) throw error;

    return apiSuccess({ readAt: now }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
