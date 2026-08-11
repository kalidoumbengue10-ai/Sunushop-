import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["admin"]);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "";
    const plan = url.searchParams.get("plan") ?? "";
    const cycle = url.searchParams.get("cycle") ?? "";
    const merchant = url.searchParams.get("merchant") ?? "";
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") ?? "")
      ? url.searchParams.get("month")!
      : new Date().toISOString().slice(0, 7);
    const monthStart = new Date(`${month}-01T00:00:00.000Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

    let paymentsQuery = supabase
      .from("subscription_payment_submissions")
      .select("id, merchant_id, plan_id, channel, destination_number, external_reference, amount_xof, paid_at, status, created_at, billing_cycle, period_months, merchant_accounts!inner(public_name, slug)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200);
    if (plan) paymentsQuery = paymentsQuery.eq("plan_id", plan);
    if (cycle) paymentsQuery = paymentsQuery.eq("billing_cycle", cycle);
    if (merchant) paymentsQuery = /^[0-9a-f-]{36}$/i.test(merchant)
      ? paymentsQuery.eq("merchant_id", merchant)
      : paymentsQuery.ilike("merchant_accounts.public_name", `%${merchant}%`);

    // Le cast reste compatible avec une base pas encore migrée localement.
    let billingQuery = (supabase as any)
      .from("subscription_billing_periods")
      .select("id, merchant_id, plan_id, billing_cycle, period_months, amount_xof, service_period_start, service_period_end, due_at, status, paid_at, payment_submission_id, merchant_accounts!inner(public_name, slug), subscription_payment_submissions!subscription_billing_periods_payment_submission_id_fkey(channel, external_reference)")
      .lt("service_period_start", monthEnd.toISOString())
      .gt("service_period_end", monthStart.toISOString())
      .order("due_at", { ascending: true });
    if (status && status !== "pending") billingQuery = billingQuery.eq("status", status === "covered" ? "paid" : status);
    if (plan) billingQuery = billingQuery.eq("plan_id", plan);
    if (cycle) billingQuery = billingQuery.eq("billing_cycle", cycle);
    if (merchant) billingQuery = /^[0-9a-f-]{36}$/i.test(merchant)
      ? billingQuery.eq("merchant_id", merchant)
      : billingQuery.ilike("merchant_accounts.public_name", `%${merchant}%`);

    const [{ data: payments, error: paymentError }, { data: billingRows, error: billingError }] = await Promise.all([
      paymentsQuery,
      billingQuery,
    ]);
    if (paymentError) throw paymentError;
    if (billingError) throw billingError;

    let billingItems = (billingRows ?? []).map((row: any) => ({
      ...row,
      displayStatus: row.status === "paid" && new Date(row.due_at) < monthStart ? "covered" : row.status,
    }));
    if (status === "covered" || status === "paid") {
      billingItems = billingItems.filter((row: { displayStatus: string }) => row.displayStatus === status);
    }

    if (url.searchParams.get("format") === "csv") {
      const headers = ["Marchand", "Plan", "Cycle", "Période début", "Période fin", "Montant XOF", "Échéance", "Statut", "Canal", "Référence"];
      const lines = billingItems.map((item: Record<string, unknown>) => {
        const account = Array.isArray(item.merchant_accounts) ? item.merchant_accounts[0] : item.merchant_accounts;
        const submission = Array.isArray(item.subscription_payment_submissions) ? item.subscription_payment_submissions[0] : item.subscription_payment_submissions;
        return [
          (account as { public_name?: string } | null)?.public_name,
          item.plan_id, item.billing_cycle, item.service_period_start, item.service_period_end,
          item.amount_xof, item.due_at, item.displayStatus,
          (submission as { channel?: string } | null)?.channel,
          (submission as { external_reference?: string } | null)?.external_reference,
        ].map(csvCell).join(",");
      });
      return new Response(`\uFEFF${headers.map(csvCell).join(",")}\n${lines.join("\n")}`, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="abonnements-${month}.csv"` },
      });
    }

    return apiSuccess({ items: payments ?? [], billingItems, month }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
