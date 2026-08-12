import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure } from "@/lib/api/response";
import { formatMerchantOrderNumber } from "@/lib/domain/merchant-ui";
import { renderOrderReceiptPdf } from "@/lib/domain/receipt-pdf";

const paymentMethodLabels: Record<string, string> = {
  cash_on_delivery: "Espèces au retrait",
  wave_direct: "Wave",
  orange_money_direct: "Orange Money",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-SN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Dakar",
  }).format(new Date(value));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const db = supabase as any;

    const { data: order, error: orderError } = await db
      .from("orders")
      .select(
        "id, buyer_id, merchant_id, merchant_sequence, public_code, payment_method, payment_status, subtotal_xof, delivery_fee_xof, loyalty_discount_xof, total_xof, created_at",
      )
      .eq("id", id)
      .single();
    if (orderError) throw orderError;
    if (!["paid", "refund_pending", "refunded"].includes(order.payment_status)) {
      throw new ApiError(409, "ORDER_NOT_PAID", "Cette commande n’est pas encore payée.");
    }

    const [{ data: items, error: itemsError }, { data: declaration, error: declarationError }] = await Promise.all([
      db
        .from("order_items")
        .select("product_snapshot, quantity, unit_price_xof, line_total_xof")
        .eq("order_id", id),
      db
        .from("direct_payment_declarations")
        .select("external_reference, confirmed_by_merchant_at, declared_at")
        .eq("order_id", id)
        .eq("status", "confirmed")
        .order("confirmed_by_merchant_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (itemsError) throw itemsError;
    if (declarationError) throw declarationError;

    const admin = requireAdminClient();
    const [{ data: merchant, error: merchantError }, { data: buyer, error: buyerError }] = await Promise.all([
      admin.from("merchant_accounts").select("public_name, phone").eq("id", order.merchant_id).single(),
      admin.from("profiles").select("display_name").eq("id", order.buyer_id).single(),
    ]);
    if (merchantError) throw merchantError;
    if (buyerError) throw buyerError;

    const pdfBytes = await renderOrderReceiptPdf({
      publicCode: order.public_code,
      merchantOrderNumber: order.merchant_sequence ? formatMerchantOrderNumber(order.merchant_sequence) : null,
      issuedAt: formatDateTime(new Date().toISOString()),
      paymentMethodLabel: paymentMethodLabels[order.payment_method] ?? order.payment_method,
      paymentReference: declaration?.external_reference ?? null,
      paidAt: declaration?.confirmed_by_merchant_at ? formatDateTime(declaration.confirmed_by_merchant_at) : null,
      buyerName: buyer.display_name ?? "Client SunuShop",
      merchantName: merchant.public_name,
      merchantPhone: merchant.phone ?? null,
      items: (items ?? []).map((item: any) => ({
        title: item.product_snapshot?.title ?? "Article",
        quantity: item.quantity,
        unitPriceXof: item.unit_price_xof,
        lineTotalXof: item.line_total_xof,
      })),
      subtotalXof: order.subtotal_xof,
      deliveryFeeXof: order.delivery_fee_xof,
      loyaltyDiscountXof: order.loyalty_discount_xof ?? 0,
      totalXof: order.total_xof,
    });

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="recu-commande-${order.public_code}.pdf"`,
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
