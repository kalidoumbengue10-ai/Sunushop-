import { requireAdminClient, requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";

const PAGE_SIZE = 25;

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["support", "admin"]);
    const admin = requireAdminClient();
    const url = new URL(request.url);
    const segment = url.searchParams.get("segment") === "clients" ? "clients" : "prospects";
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = (url.searchParams.get("status") ?? "").trim();
    const plan = (url.searchParams.get("plan") ?? "").trim();
    const city = (url.searchParams.get("city") ?? "").trim().toLowerCase();
    const activity = (url.searchParams.get("activity") ?? "").trim().toLowerCase();
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    if (segment === "prospects") {
      const { data: leads, error } = await supabase
        .from("crm_leads")
        .select("id, source, full_name, business_name, email, phone, city, business_type, sales_channel, message, status, priority, merchant_id, last_contacted_at, next_follow_up_at, converted_at, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const merchantIds = [...new Set((leads ?? []).map((lead) => lead.merchant_id).filter(Boolean))] as string[];
      const customerMerchantIds = new Set<string>();
      if (merchantIds.length) {
        const { data: customers, error: customerError } = await admin
          .from("merchant_accounts")
          .select("id")
          .in("id", merchantIds)
          .not("customer_since", "is", null);
        if (customerError) throw customerError;
        for (const merchant of customers ?? []) customerMerchantIds.add(merchant.id);
      }

      const filtered = (leads ?? [])
        .filter((lead) => !lead.merchant_id || !customerMerchantIds.has(lead.merchant_id))
        .filter((lead) => !status || lead.status === status)
        .filter((lead) => !city || (lead.city ?? "").toLowerCase().includes(city))
        .filter((lead) => !activity || (lead.business_type ?? "").toLowerCase().includes(activity))
        .filter((lead) => !query || [lead.full_name, lead.business_name, lead.email, lead.phone, lead.city, lead.business_type]
          .some((value) => String(value ?? "").toLowerCase().includes(query)))
        .map((lead) => ({ kind: "prospect" as const, ...lead }));

      const start = (page - 1) * PAGE_SIZE;
      return apiSuccess({ segment, items: filtered.slice(start, start + PAGE_SIZE), total: filtered.length, page, pageSize: PAGE_SIZE }, { requestId });
    }

    const { data: merchants, error } = await admin
      .from("merchant_accounts")
      .select("id, public_name, legal_name, email, phone, city, region, description, status, verification_status, subscription_status, customer_since, created_at, merchant_subscriptions(id, plan_id, status, starts_at, current_period_ends_at, billing_cycle, subscription_plans(name)), crm_leads(id, full_name, business_type, status)")
      .not("customer_since", "is", null)
      .order("customer_since", { ascending: false })
      .limit(500);
    if (error) throw error;

    const filtered = (merchants ?? [])
      .map((merchant: any) => {
        const subscriptions = [...(merchant.merchant_subscriptions ?? [])].sort((a: any, b: any) => String(b.starts_at ?? "").localeCompare(String(a.starts_at ?? "")));
        const subscription = subscriptions[0] ?? null;
        const lead = one(merchant.crm_leads);
        const planRow = one(subscription?.subscription_plans);
        return {
          kind: "client" as const,
          id: merchant.id,
          publicName: merchant.public_name,
          legalName: merchant.legal_name,
          contactName: lead?.full_name ?? merchant.public_name,
          email: merchant.email,
          phone: merchant.phone,
          city: merchant.city,
          region: merchant.region,
          activity: lead?.business_type ?? merchant.description,
          status: merchant.status,
          verificationStatus: merchant.verification_status,
          subscriptionStatus: merchant.subscription_status,
          customerSince: merchant.customer_since,
          planId: subscription?.plan_id ?? null,
          planName: planRow?.name ?? subscription?.plan_id ?? null,
          billingCycle: subscription?.billing_cycle ?? null,
          periodEndsAt: subscription?.current_period_ends_at ?? null,
        };
      })
      .filter((merchant: any) => !status || merchant.subscriptionStatus === status || merchant.status === status)
      .filter((merchant: any) => !plan || merchant.planId === plan)
      .filter((merchant: any) => !city || String(merchant.city ?? "").toLowerCase().includes(city))
      .filter((merchant: any) => !activity || String(merchant.activity ?? "").toLowerCase().includes(activity))
      .filter((merchant: any) => !query || [merchant.publicName, merchant.legalName, merchant.contactName, merchant.email, merchant.phone, merchant.city, merchant.activity]
        .some((value) => String(value ?? "").toLowerCase().includes(query)));

    const start = (page - 1) * PAGE_SIZE;
    return apiSuccess({ segment, items: filtered.slice(start, start + PAGE_SIZE), total: filtered.length, page, pageSize: PAGE_SIZE }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

