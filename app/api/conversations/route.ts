import { requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { conversationCreateSchema } from "@/lib/domain/schemas";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user, supabase } = await requireUser();

    const [{ data: buyerConversations, error: buyerError }, { data: memberships, error: membershipError }, { data: adminRoles, error: adminError }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select("id, kind, merchant_id, order_id, product_id, subject, last_message_at, buyer_last_read_at, merchant_accounts(public_name, slug), orders(public_code, status)")
          .eq("buyer_id", user.id)
          .order("last_message_at", { ascending: false }),
        supabase.from("merchant_members").select("merchant_id").eq("user_id", user.id).eq("active", true),
        supabase.from("admin_roles").select("role").eq("user_id", user.id).eq("active", true).in("role", ["support", "admin"]),
      ]);
    if (buyerError) throw buyerError;
    if (membershipError) throw membershipError;
    if (adminError) throw adminError;

    const merchantIds = (memberships ?? []).map((m) => m.merchant_id);
    let merchantConversations: unknown[] = [];
    if (merchantIds.length) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, kind, buyer_id, merchant_id, order_id, product_id, subject, last_message_at, merchant_last_read_at, profiles!conversations_buyer_id_fkey(display_name, email, phone), orders(public_code, status)")
        .in("merchant_id", merchantIds)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      merchantConversations = data ?? [];
    }

    let supportConversations: unknown[] = [];
    if ((adminRoles ?? []).length) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, kind, buyer_id, order_id, subject, last_message_at, admin_last_read_at, profiles!conversations_buyer_id_fkey(display_name, email, phone), orders(public_code, status)")
        .eq("kind", "buyer_support")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      supportConversations = data ?? [];
    }

    return apiSuccess(
      {
        asBuyer: buyerConversations ?? [],
        asMerchant: merchantConversations,
        asAdmin: supportConversations,
      },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = conversationCreateSchema.parse(await request.json());
    const { user, supabase } = await requireUser();

    if (input.kind === "buyer_merchant" && input.merchantId) {
      const { data: existing, error: existingError } = await supabase
        .from("conversations")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("merchant_id", input.merchantId)
        .eq("order_id", input.orderId ?? "00000000-0000-0000-0000-000000000000")
        .eq("product_id", input.productId ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return apiSuccess({ id: existing.id, created: false }, { requestId });
    }

    if (input.kind === "buyer_support") {
      const { data: existing, error: existingError } = await supabase
        .from("conversations")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("kind", "buyer_support")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (input.orderId || input.subject) {
          const { error: updateError } = await supabase
            .from("conversations")
            .update({
              order_id: input.orderId ?? null,
              subject: input.subject ?? null,
            })
            .eq("id", existing.id);
          if (updateError) throw updateError;
        }
        return apiSuccess({ id: existing.id, created: false }, { requestId });
      }
    }

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        kind: input.kind,
        buyer_id: user.id,
        merchant_id: input.kind === "buyer_merchant" ? input.merchantId : null,
        order_id: input.orderId ?? null,
        product_id: input.productId ?? null,
        subject: input.subject ?? null,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "CONFLICT", "Ce fil existe déjà.");
      throw error;
    }

    return apiSuccess({ id: data.id, created: true }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
