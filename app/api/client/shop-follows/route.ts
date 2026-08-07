import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { shopFollowInputSchema } from "@/lib/domain/schemas";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("shop_follows")
      .select("merchant_id, created_at, merchant_accounts(public_name, slug, city, region)")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = shopFollowInputSchema.parse(await request.json());
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { error } = await admin
      .from("shop_follows")
      .upsert({ buyer_id: user.id, merchant_id: input.merchantId }, { onConflict: "buyer_id,merchant_id" });
    if (error) throw error;
    return apiSuccess({ following: true }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = shopFollowInputSchema.parse(await request.json());
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { error } = await admin
      .from("shop_follows")
      .delete()
      .eq("buyer_id", user.id)
      .eq("merchant_id", input.merchantId);
    if (error) throw error;
    return apiSuccess({ following: false }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
