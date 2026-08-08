import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { messageCreateSchema } from "@/lib/domain/schemas";
import { enqueueEmail } from "@/lib/notifications/outbox";
import { siteConfig } from "@/app/site-config";

async function resolveSenderRole(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  conversation: { buyer_id: string; merchant_id: string | null; kind: string },
) {
  if (conversation.buyer_id === userId) return "buyer" as const;
  if (conversation.merchant_id) {
    const { data } = await supabase
      .from("merchant_members")
      .select("id")
      .eq("merchant_id", conversation.merchant_id)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (data) return "merchant" as const;
  }
  if (conversation.kind === "buyer_support") {
    const { data } = await supabase
      .from("admin_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("active", true)
      .in("role", ["support", "admin"])
      .maybeSingle();
    if (data) return "admin" as const;
  }
  return null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

    let query = supabase
      .from("messages")
      .select("id, sender_id, sender_role, body, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;
    if (error) throw error;

    return apiSuccess({ items: (data ?? []).reverse() }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

const MESSAGE_RATE_LIMIT = 20;
const MESSAGE_RATE_WINDOW_MS = 60_000;
const NOTIFICATION_WINDOW_MS = 3_600_000;

async function notifyRecipient(
  conversationId: string,
  conversation: { buyer_id: string; merchant_id: string | null; kind: string },
  senderRole: "buyer" | "merchant" | "admin",
  sender: { id: string; email?: string | null },
) {
  const admin = requireAdminClient();
  const hourBucket = Math.floor(Date.now() / NOTIFICATION_WINDOW_MS);
  const dedupeKey = `new_message:${conversationId}:${senderRole}:${hourBucket}`;
  const senderLabel = sender.email ?? (senderRole === "buyer" ? "Un client" : senderRole === "merchant" ? "Une boutique" : "SunuShop");
  const url = `${siteConfig.url}/messages`;

  if (senderRole === "buyer") {
    if (conversation.merchant_id) {
      const { data: members } = await admin
        .from("merchant_members")
        .select("user_id")
        .eq("merchant_id", conversation.merchant_id)
        .eq("active", true)
        .in("role", ["owner", "manager"]);
      for (const member of members ?? []) {
        await enqueueEmail(admin, { dedupeKey: `${dedupeKey}:${member.user_id}`, template: "new_message", recipientUserId: member.user_id, payload: { senderLabel, url } }).catch(() => undefined);
      }
    } else if (conversation.kind === "buyer_support") {
      const { data: admins } = await admin.from("admin_roles").select("user_id").eq("active", true).in("role", ["support", "admin"]);
      for (const entry of admins ?? []) {
        await enqueueEmail(admin, { dedupeKey: `${dedupeKey}:${entry.user_id}`, template: "new_message", recipientUserId: entry.user_id, payload: { senderLabel, url } }).catch(() => undefined);
      }
    }
  } else {
    await enqueueEmail(admin, { dedupeKey, template: "new_message", recipientUserId: conversation.buyer_id, payload: { senderLabel, url } }).catch(() => undefined);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const input = messageCreateSchema.parse(await request.json());
    const { user, supabase } = await requireUser();

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, buyer_id, merchant_id, kind")
      .eq("id", id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation introuvable.");

    const senderRole = await resolveSenderRole(supabase, user.id, conversation);
    if (!senderRole) throw new ApiError(403, "FORBIDDEN", "Vous n’avez pas accès à ce fil.");

    const since = new Date(Date.now() - MESSAGE_RATE_WINDOW_MS).toISOString();
    const { count, error: rateError } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", id)
      .eq("sender_id", user.id)
      .gte("created_at", since);
    if (rateError) throw rateError;
    if ((count ?? 0) >= MESSAGE_RATE_LIMIT) {
      throw new ApiError(429, "RATE_LIMITED", "Trop de messages envoyés. Réessayez dans un instant.");
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: id, sender_id: user.id, sender_role: senderRole, body: input.body })
      .select("id, sender_id, sender_role, body, created_at")
      .single();
    if (error) throw error;

    const readColumn = senderRole === "buyer" ? "buyer_last_read_at" : senderRole === "merchant" ? "merchant_last_read_at" : "admin_last_read_at";
    await supabase.from("conversations").update({ [readColumn]: data.created_at }).eq("id", id);

    void notifyRecipient(id, conversation, senderRole, user).catch(() => undefined);

    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
