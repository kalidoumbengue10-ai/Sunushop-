import { requireAdminRole } from "@/lib/api/auth";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { platformPaymentSettingsSchema } from "@/lib/domain/schemas";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { supabase } = await requireAdminRole(["admin"]);
    const { data, error } = await (supabase as any).from("platform_payment_settings").select("channel, payment_number, account_holder, active, updated_at").order("channel");
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = platformPaymentSettingsSchema.parse(await request.json());
    const { supabase } = await requireAdminRole(["admin"]);
    const { data, error } = await supabase.rpc("set_platform_payment_setting", {
      p_channel: input.channel, p_payment_number: input.paymentNumber,
      p_account_holder: input.accountHolder ?? "", p_active: input.active,
    });
    if (error) throw error;
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
