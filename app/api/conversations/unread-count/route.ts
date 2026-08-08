import { requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user, supabase } = await requireUser();

    // Un simple comptage par requête au chargement : pas d'abonnement
    // permanent pour un badge, cf. lot 3 (temps réel réservé aux fils ouverts).
    const { data: buyerConversations, error: buyerError } = await supabase
      .from("conversations")
      .select("last_message_at, buyer_last_read_at")
      .eq("buyer_id", user.id);
    if (buyerError) throw buyerError;

    const { data: memberships } = await supabase.from("merchant_members").select("merchant_id").eq("user_id", user.id).eq("active", true);
    const merchantIds = (memberships ?? []).map((m) => m.merchant_id);
    let merchantConversations: Array<{ last_message_at: string; merchant_last_read_at: string | null }> = [];
    if (merchantIds.length) {
      const { data, error } = await supabase
        .from("conversations")
        .select("last_message_at, merchant_last_read_at")
        .in("merchant_id", merchantIds);
      if (error) throw error;
      merchantConversations = data ?? [];
    }

    const { data: adminRoles } = await supabase.from("admin_roles").select("role").eq("user_id", user.id).eq("active", true).in("role", ["support", "admin"]);
    let adminConversations: Array<{ last_message_at: string; admin_last_read_at: string | null }> = [];
    if ((adminRoles ?? []).length) {
      const { data, error } = await supabase.from("conversations").select("last_message_at, admin_last_read_at").eq("kind", "buyer_support");
      if (error) throw error;
      adminConversations = data ?? [];
    }

    const isUnread = (lastMessageAt: string, lastReadAt: string | null) =>
      !lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt);

    const count =
      (buyerConversations ?? []).filter((c) => isUnread(c.last_message_at, c.buyer_last_read_at)).length +
      merchantConversations.filter((c) => isUnread(c.last_message_at, c.merchant_last_read_at)).length +
      adminConversations.filter((c) => isUnread(c.last_message_at, c.admin_last_read_at)).length;

    return apiSuccess({ count }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
