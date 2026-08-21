import { randomBytes } from "node:crypto";
import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { sendCourierInvitation } from "@/lib/api/courier-invitations";
import { requireFulfillment as requireManager } from "@/lib/api/merchant-guards";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { courierInvitationSchema, courierUpdateSchema } from "@/lib/domain/schemas";
import { normalizeMerchantPhone } from "@/lib/api/merchant-onboarding";
import { courierTechnicalEmail } from "@/lib/domain/courier-access";

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
        .select("id, courier_membership_id, email, payload, status, expires_at, created_at")
        .eq("merchant_id", merchantId)
        .eq("kind", "courier")
        .order("created_at", { ascending: false }),
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
    const invitationByMembership = new Map<string, (typeof invitations)[number]>();
    for (const invitation of invitations ?? []) {
      if (invitation.courier_membership_id && !invitationByMembership.has(invitation.courier_membership_id)) {
        invitationByMembership.set(invitation.courier_membership_id, invitation);
      }
    }
    const invitationIds = [...invitationByMembership.values()].map((invitation) => invitation.id);
    const { data: outboxRows, error: outboxError } = invitationIds.length
      ? await (admin as any).from("notification_outbox").select("dedupe_key, status, delivery_state, processed_at, last_error, payload").in("dedupe_key", invitationIds.map((id) => `courier-invitation:${id}`))
      : { data: [], error: null };
    if (outboxError) throw outboxError;
    const outboxByKey = new Map<string, any>((outboxRows ?? []).map((row: any) => [row.dedupe_key, row]));
    const courierUserIds = (couriers ?? []).map((courier) => courier.courier_user_id).filter((value): value is string => Boolean(value));
    const { data: globalActiveRows } = courierUserIds.length
      ? await (admin as any).from("deliveries").select("id, status, courier_memberships!inner(courier_user_id)").in("courier_memberships.courier_user_id", courierUserIds).not("status", "in", "(delivered,failed,cancelled)")
      : { data: [] };
    const globalActiveByUser = new Map<string, number>();
    for (const row of globalActiveRows ?? []) {
      const linked = Array.isArray(row.courier_memberships) ? row.courier_memberships[0] : row.courier_memberships;
      if (linked?.courier_user_id) globalActiveByUser.set(linked.courier_user_id, (globalActiveByUser.get(linked.courier_user_id) ?? 0) + 1);
    }

    const items = await Promise.all((couriers ?? []).map(async (courier) => {
      const own = (deliveries ?? []).filter((delivery) => delivery.courier_membership_id === courier.id);
      const invitation = invitationByMembership.get(courier.id) ?? null;
      const notification = invitation ? outboxByKey.get(`courier-invitation:${invitation.id}`) : null;
      const notificationPayload = notification?.payload as Record<string, unknown> | null;
      const invitationStatus = courier.status === "active"
        ? "claimed"
        : invitation?.status === "pending" && new Date(invitation.expires_at).getTime() <= Date.now()
          ? "expired"
          : invitation?.status ?? null;
      const photoUrl = courier.photo_storage_path
        ? (await admin.storage.from("courier-profiles").createSignedUrl(courier.photo_storage_path, 3600)).data?.signedUrl ?? null
        : null;
      return {
        ...courier,
        photoUrl,
        invitation: invitation ? {
          id: invitation.id,
          status: invitationStatus,
          emailStatus: notification?.delivery_state ?? notification?.status ?? "pending",
          sentAt: notification?.processed_at ?? null,
          expiresAt: invitation.expires_at,
          invitationUrl: typeof notificationPayload?.url === "string" ? notificationPayload.url : null,
          lastError: notification?.last_error ?? null,
        } : null,
        stats: {
          active: own.filter((delivery) => !["delivered", "failed", "cancelled"].includes(delivery.status)).length,
          deliveredThisMonth: own.filter((delivery) => delivery.status === "delivered" && delivery.delivered_at && new Date(delivery.delivered_at) >= monthStart).length,
          deliveredTotal: own.filter((delivery) => delivery.status === "delivered").length,
          failedTotal: own.filter((delivery) => delivery.status === "failed").length,
          globalActive: courier.courier_user_id ? globalActiveByUser.get(courier.courier_user_id) ?? 0 : 0,
        },
        availability: courier.courier_user_id && (globalActiveByUser.get(courier.courier_user_id) ?? 0) > 0 ? "busy" : "available",
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

    const phone = normalizeMerchantPhone(input.phone);
    const email = input.email?.toLowerCase() ?? null;
    const { data: profiles, error: profileLookupError } = await admin
      .from("courier_profiles")
      .select("id, user_id, email, display_name, vehicle_type, vehicle_registration")
      .eq("phone", phone)
      .order("created_at")
      .limit(1);
    if (profileLookupError) throw profileLookupError;

    let courierProfile = profiles?.[0] ?? null;
    let courierUserId = courierProfile?.user_id ?? null;
    if (!courierUserId) {
      const { data: publicProfiles, error: publicProfileError } = await admin
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .limit(1);
      if (publicProfileError) throw publicProfileError;
      courierUserId = publicProfiles?.[0]?.id ?? null;
    }
    if (!courierUserId) {
      const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
        email: courierTechnicalEmail(phone),
        email_confirm: true,
        password: `SunuShop-${randomBytes(32).toString("base64url")}!`,
        user_metadata: { profile: "courier", display_name: input.displayName },
      });
      if (createUserError || !createdUser.user) throw createUserError ?? new Error("COURIER_USER_CREATE_FAILED");
      courierUserId = createdUser.user.id;
    }

    if (!courierProfile) {
      const { data, error: createProfileError } = await admin
        .from("courier_profiles")
        .insert({
          user_id: courierUserId,
          display_name: input.displayName,
          phone,
          email,
          vehicle_type: input.vehicleType ?? null,
          vehicle_registration: input.vehicleRegistration ?? null,
          verification_status: "verified",
          verified_at: new Date().toISOString(),
        })
        .select("id, user_id, email, display_name, vehicle_type, vehicle_registration")
        .single();
      if (createProfileError) throw createProfileError;
      courierProfile = data;
    } else {
      const { error: updateProfileError } = await admin
        .from("courier_profiles")
        .update({
          email: courierProfile.email ?? email,
          vehicle_type: courierProfile.vehicle_type ?? input.vehicleType ?? null,
          vehicle_registration: courierProfile.vehicle_registration ?? input.vehicleRegistration ?? null,
          verification_status: "verified",
          verified_at: new Date().toISOString(),
        })
        .eq("id", courierProfile.id);
      if (updateProfileError) throw updateProfileError;
    }

    const { data: existingMembership, error: existingError } = await admin
      .from("courier_memberships")
      .select("id, status, phone")
      .eq("merchant_id", input.merchantId)
      .eq("courier_profile_id", courierProfile.id)
      .maybeSingle();
    if (existingError) throw existingError;

    let membershipId: string;
    if (existingMembership) {
      const { data, error } = await admin
        .from("courier_memberships")
        .update({
          display_name: input.displayName,
          email,
          phone,
          vehicle_type: input.vehicleType ?? null,
          vehicle_registration: input.vehicleRegistration ?? null,
          status: existingMembership.status === "active" ? "active" : "pending_invitation",
          invited_at: new Date().toISOString(),
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
          courier_user_id: courierUserId,
          courier_profile_id: courierProfile.id,
          email,
          display_name: input.displayName,
          phone,
          vehicle_type: input.vehicleType ?? null,
          vehicle_registration: input.vehicleRegistration ?? null,
          status: "pending_invitation",
          invited_by: user.id,
          accepted_at: null,
        })
        .select("id")
        .single();
      if (error) throw error;
      membershipId = data.id;
    }

    const invitation = await sendCourierInvitation({
      admin,
      request,
      merchantId: input.merchantId,
      membership: {
        id: membershipId,
        email,
        display_name: input.displayName,
        phone,
        vehicle_type: input.vehicleType ?? null,
        vehicle_registration: input.vehicleRegistration ?? null,
      },
      invitedBy: user.id,
    });
    await admin.from("audit_events").insert({
      actor_id: user.id,
      merchant_id: input.merchantId,
      action: existingMembership ? "courier.membership.update" : "courier.membership.create",
      entity_type: "courier_membership",
      entity_id: membershipId,
      request_id: requestId,
      metadata: { email, phone, courierProfileId: courierProfile.id },
    });
    return apiSuccess({ ...invitation, membershipId }, { status: 201, requestId });
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
      .select("id, status, phone")
      .eq("id", input.membershipId)
      .eq("merchant_id", input.merchantId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new ApiError(404, "COURIER_NOT_FOUND", "Livreur introuvable.");
    if (normalizeMerchantPhone(input.phone) !== current.phone) {
      throw new ApiError(
        409,
        "COURIER_PHONE_IMMUTABLE",
        "Le téléphone identifie l’accès global du livreur et ne peut pas être modifié par une boutique.",
      );
    }
    const { data, error } = await admin
      .from("courier_memberships")
      .update({
        display_name: input.displayName,
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
