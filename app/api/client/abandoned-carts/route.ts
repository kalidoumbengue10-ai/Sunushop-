import { z } from "zod";
import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

const reactivateSchema = z.object({ cartId: z.uuid() });

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data: carts, error } = await admin
      .from("carts")
      .select("id, updated_at, cart_items(id, variant_id, quantity)")
      .eq("buyer_id", user.id)
      .eq("status", "abandoned")
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    const variantIds = (carts ?? []).flatMap((cart) => cart.cart_items.map((item) => item.variant_id));
    const products = variantIds.length
      ? await new SupabaseCatalogRepository(admin).findByVariantIds(variantIds)
      : [];
    const productMap = new Map(products.map((product) => [product.variant.id, product]));

    return apiSuccess({
      items: (carts ?? []).map((cart) => ({
        id: cart.id,
        updatedAt: cart.updated_at,
        items: cart.cart_items
          .map((item) => ({ ...item, product: productMap.get(item.variant_id) ?? null }))
          .filter((item) => item.product),
      })).filter((cart) => cart.items.length),
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { cartId } = reactivateSchema.parse(await request.json());
    const { user } = await requireUser();
    const admin = requireAdminClient();

    const { data: activeCart } = await admin
      .from("carts")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (activeCart) {
      // Fusionne les articles de l'ancien panier dans le panier actif courant,
      // puis referme le panier abandonné pour ne pas en garder deux "active".
      const { data: staleItems } = await admin
        .from("cart_items")
        .select("variant_id, merchant_id, quantity")
        .eq("cart_id", cartId);
      for (const item of staleItems ?? []) {
        await admin.from("cart_items").upsert(
          { cart_id: activeCart.id, variant_id: item.variant_id, merchant_id: item.merchant_id, quantity: item.quantity },
          { onConflict: "cart_id,variant_id", ignoreDuplicates: false },
        );
      }
      await admin.from("carts").update({ status: "converted" }).eq("id", cartId).eq("buyer_id", user.id);
      return apiSuccess({ cartId: activeCart.id }, { requestId });
    }

    const { error } = await admin
      .from("carts")
      .update({ status: "active" })
      .eq("id", cartId)
      .eq("buyer_id", user.id);
    if (error) throw error;

    return apiSuccess({ cartId }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
