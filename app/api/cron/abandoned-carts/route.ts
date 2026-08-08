import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";

const INACTIVITY_HOURS = 24;

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const admin = requireAdminClient();
    const cutoff = new Date(Date.now() - INACTIVITY_HOURS * 3_600_000).toISOString();

    // Un panier actif est abandonné s'il contient au moins un article et
    // qu'aucun article n'a bougé depuis plus de 24 h. `carts.updated_at` ne
    // reflète que la ligne `carts` elle-même (jamais touchée après création) ;
    // l'activité réelle se lit sur `cart_items`.
    const { data: activeCarts, error: cartsError } = await admin
      .from("carts")
      .select("id, cart_items(updated_at)")
      .eq("status", "active");
    if (cartsError) throw cartsError;

    const staleCartIds = (activeCarts ?? [])
      .filter((cart) => {
        const items = cart.cart_items ?? [];
        if (!items.length) return false;
        const lastActivity = Math.max(...items.map((item) => new Date(item.updated_at).getTime()));
        return lastActivity < new Date(cutoff).getTime();
      })
      .map((cart) => cart.id);

    if (!staleCartIds.length) {
      return apiSuccess({ markedAbandoned: 0 }, { requestId });
    }

    const { error: updateError } = await admin
      .from("carts")
      .update({ status: "abandoned" })
      .in("id", staleCartIds);
    if (updateError) throw updateError;

    return apiSuccess({ markedAbandoned: staleCartIds.length }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
