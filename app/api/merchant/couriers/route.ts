import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { createInvitationToken, invitationUrl } from "@/lib/domain/invitation-token";
import { courierInvitationSchema } from "@/lib/domain/schemas";

async function requireManager(merchantId: string) {
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", merchantId)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["owner", "manager", "fulfillment"])
    .maybeSingle();
  if (!data) throw new ApiError(403, "FORBIDDEN", "Accès refusé.");
  return user;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    await requireManager(merchantId);
    const admin = requireAdminClient();
    const [{ data: couriers, error }, { data: invitations, error: invitationError }] = await Promise.all([
      admin
        .from("courier_memberships")
        .select("id, courier_user_id, display_name, phone, status, accepted_at")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false }),
      admin
        .from("workspace_invitations")
        .select("id, email, payload, status, expires_at, created_at")
        .eq("merchant_id", merchantId)
        .eq("kind", "courier")
        .eq("status", "pending"),
    ]);
    if (error) throw error;
    if (invitationError) throw invitationError;
    return apiSuccess({ items: couriers ?? [], invitations: invitations ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = courierInvitationSchema.parse(await request.json());
    const user = await requireManager(input.merchantId);
    const admin = requireAdminClient();
    const { token, tokenHash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { data, error } = await admin
      .from("workspace_invitations")
      .insert({
        kind: "courier",
        merchant_id: input.merchantId,
        email: input.email,
        token_hash: tokenHash,
        payload: { displayName: input.displayName, phone: input.phone },
        expires_at: expiresAt,
        invited_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    const url = invitationUrl(request, token, input.email);
    const { error: outboxError } = await admin.from("notification_outbox").insert({
      dedupe_key: `courier-invitation:${data.id}`,
      channel: "email",
      template: "courier_invitation",
      payload: { to: input.email, displayName: input.displayName, url, expiresAt },
    });
    if (outboxError) throw outboxError;
    return apiSuccess({ id: data.id, expiresAt }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
