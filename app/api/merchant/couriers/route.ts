import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { requireFulfillment as requireManager } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { createInvitationToken, invitationUrl } from "@/lib/domain/invitation-token";
import { courierInvitationSchema, courierUpdateSchema } from "@/lib/domain/schemas";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const merchantId = new URL(request.url).searchParams.get("merchantId") ?? "";
    await requireManager(merchantId);
    const admin = requireAdminClient();
    const [{ data: couriers, error }, { data: invitations, error: invitationError }, { data: deliveries, error: deliveryError }] = await Promise.all([
      admin
        .from("courier_memberships")
        .select("id, courier_user_id, display_name, email, phone, vehicle_type, vehicle_registration, photo_storage_path, status, accepted_at, wave_payment_number, orange_money_payment_number, preferred_payment_channel")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false }),
      admin
        .from("workspace_invitations")
        .select("id, email, payload, status, expires_at, created_at")
        .eq("merchant_id", merchantId)
        .eq("kind", "courier")
        .eq("status", "pending"),
      admin
        .from("deliveries")
        .select("courier_membership_id, status, delivered_at")
        .eq("merchant_id", merchantId),
    ]);
    if (error) throw error;
    if (invitationError) throw invitationError;
    if (deliveryError) throw deliveryError;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const items = await Promise.all((couriers ?? []).map(async (courier) => {
      const own = (deliveries ?? []).filter((delivery) => delivery.courier_membership_id === courier.id);
      const photoUrl = courier.photo_storage_path
        ? (await admin.storage.from("courier-profiles").createSignedUrl(courier.photo_storage_path, 3600)).data?.signedUrl ?? null
        : null;
      return {
        ...courier,
        photoUrl,
        stats: {
          active: own.filter((delivery) => !["delivered", "failed", "cancelled"].includes(delivery.status)).length,
          deliveredThisMonth: own.filter((delivery) => delivery.status === "delivered" && delivery.delivered_at && new Date(delivery.delivered_at) >= monthStart).length,
          deliveredTotal: own.filter((delivery) => delivery.status === "delivered").length,
          failedTotal: own.filter((delivery) => delivery.status === "failed").length,
        },
      };
    }));
    return apiSuccess({ items, invitations: invitations ?? [] }, { requestId });
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

    const { data: existingMembership, error: existingError } = await admin
      .from("courier_memberships")
      .select("id, courier_user_id")
      .eq("merchant_id", input.merchantId)
      .eq("email", input.email)
      .maybeSingle();
    if (existingError) throw existingError;

    let membershipId: string;
    if (existingMembership) {
      const { data, error } = await admin
        .from("courier_memberships")
        .update({
          display_name: input.displayName,
          phone: input.phone,
          vehicle_type: input.vehicleType ?? null,
          vehicle_registration: input.vehicleRegistration ?? null,
          status: "active",
        })
        .eq("id", existingMembership.id)
        .select("id")
        .single();
      if (error) throw error;
      membershipId = data.id;
    } else {
      const { data, error } = await admin
        .from("courier_memberships")
        .insert({
          merchant_id: input.merchantId,
          courier_user_id: null,
          email: input.email,
          display_name: input.displayName,
          phone: input.phone,
          vehicle_type: input.vehicleType ?? null,
          vehicle_registration: input.vehicleRegistration ?? null,
          status: "active",
          invited_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      membershipId = data.id;
    }

    await admin
      .from("workspace_invitations")
      .update({ status: "revoked" })
      .eq("kind", "courier")
      .eq("merchant_id", input.merchantId)
      .eq("email", input.email)
      .eq("status", "pending");

    const { token, tokenHash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { data, error } = await admin
      .from("workspace_invitations")
      .insert({
        kind: "courier",
        merchant_id: input.merchantId,
        email: input.email,
        token_hash: tokenHash,
        payload: {
          displayName: input.displayName,
          phone: input.phone,
          vehicleType: input.vehicleType,
          vehicleRegistration: input.vehicleRegistration,
        },
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
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: input.merchantId,
      action: existingMembership ? "courier.membership.update" : "courier.membership.create",
      entity_type: "courier_membership",
      entity_id: membershipId,
      request_id: requestId,
      metadata: { email: input.email },
    });
    return apiSuccess({ id: data.id, membershipId, expiresAt }, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = courierUpdateSchema.parse(await request.json());
    const user = await requireManager(input.merchantId);
    const admin = requireAdminClient();
    const { data: current, error: currentError } = await admin
      .from("courier_memberships")
      .select("id, status")
      .eq("id", input.membershipId)
      .eq("merchant_id", input.merchantId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new ApiError(404, "COURIER_NOT_FOUND", "Livreur introuvable.");
    const { data, error } = await admin
      .from("courier_memberships")
      .update({
        display_name: input.displayName,
        phone: input.phone,
        vehicle_type: input.vehicleType ?? null,
        vehicle_registration: input.vehicleRegistration ?? null,
        status: input.status,
      })
      .eq("id", input.membershipId)
      .eq("merchant_id", input.merchantId)
      .select("id, display_name, email, phone, vehicle_type, vehicle_registration, status")
      .single();
    if (error) throw error;
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: input.merchantId,
      action: current.status === input.status ? "courier.profile.update" : "courier.status.update",
      entity_type: "courier_membership",
      entity_id: input.membershipId,
      request_id: requestId,
      metadata: { previousStatus: current.status, status: input.status },
    });
    return apiSuccess(data, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
