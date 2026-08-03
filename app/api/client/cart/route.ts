import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { cartItemInputSchema } from "@/lib/domain/schemas";

async function activeCart(userId: string) {
  const admin = requireAdminClient();
  const { data: existing, error } = await admin
    .from("carts")
    .select("id")
    .eq("buyer_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;
  const { data, error: createError } = await admin
    .from("carts")
    .insert({ buyer_id: userId })
    .select("id")
    .single();
  if (createError) throw createError;
  return data.id;
}

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const cartId = await activeCart(user.id);
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("cart_items")
      .select("id, variant_id, merchant_id, quantity")
      .eq("cart_id", cartId)
      .order("created_at");
    if (error) throw error;
    return apiSuccess({ cartId, items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = cartItemInputSchema.parse(await request.json());
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const cartId = await activeCart(user.id);
    if (input.quantity === 0) {
      const { error } = await admin
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("variant_id", input.variantId);
      if (error) throw error;
      return apiSuccess({ removed: true }, { requestId });
    }
    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .select("id, merchant_id, active, products!inner(status), inventory_items!inner(available_quantity, reserved_quantity)")
      .eq("id", input.variantId)
      .maybeSingle();
    if (variantError) throw variantError;
    if (!variant || !variant.active) {
      throw new ApiError(409, "VARIANT_UNAVAILABLE", "Produit indisponible.");
    }
    const inventory = Array.isArray(variant.inventory_items)
      ? variant.inventory_items[0]
      : variant.inventory_items;
    if (!inventory || inventory.available_quantity - inventory.reserved_quantity < input.quantity) {
      throw new ApiError(409, "INSUFFICIENT_STOCK", "Stock insuffisant.");
    }
    const { error } = await admin.from("cart_items").upsert(
      {
        cart_id: cartId,
        variant_id: input.variantId,
        merchant_id: variant.merchant_id,
        quantity: input.quantity,
      },
      { onConflict: "cart_id,variant_id" },
    );
    if (error) throw error;
    return apiSuccess({ cartId, variantId: input.variantId, quantity: input.quantity }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
