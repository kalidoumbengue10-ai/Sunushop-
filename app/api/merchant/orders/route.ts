import { requireActiveMerchantAccess } from "@/lib/api/merchant-access";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { merchantOrderSearchFilter, merchantOrderStatusFilter } from "@/lib/domain/merchant-order-query";
import { merchantOrdersQuerySchema } from "@/lib/domain/schemas";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = merchantOrdersQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const { admin } = await requireActiveMerchantAccess(input.merchantId, [
      "owner",
      "manager",
      "fulfillment",
    ]);

    let query = admin
      .from("orders")
      .select(
        "id, public_code, merchant_sequence, status, payment_method, payment_status, total_xof, delivery_snapshot, created_at, deliveries(id), direct_payment_declarations(id, external_reference, status, rejection_reason, confirmed_by_merchant_at)",
        { count: "exact" },
      )
      .eq("merchant_id", input.merchantId);

    const statusFilter = merchantOrderStatusFilter(input.status);
    if (statusFilter) {
      query = query.eq(statusFilter.column, statusFilter.value);
    }

    const searchFilter = merchantOrderSearchFilter(input.query);
    if (searchFilter?.kind === "merchant_sequence") {
      query = query.eq("merchant_sequence", searchFilter.value);
    } else if (searchFilter) {
      query = query.ilike("public_code", `%${searchFilter.value}%`);
    }

    const from = (input.page - 1) * input.limit;
    const to = from + input.limit - 1;
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;

    const total = count ?? 0;
    return apiSuccess({
      items: data ?? [],
      total,
      page: input.page,
      limit: input.limit,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
