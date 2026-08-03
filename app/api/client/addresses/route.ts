import { requireAdminClient, requireUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { addressInputSchema } from "@/lib/domain/schemas";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const { user } = await requireUser();
    const admin = requireAdminClient();
    const { data, error } = await admin
      .from("addresses")
      .select("id, label, recipient_name, phone, region, city, address_hint, latitude, longitude, is_default")
      .eq("owner_user_id", user.id)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return apiSuccess({ items: data ?? [] }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = addressInputSchema.parse(await request.json());
    const { user } = await requireUser();
    const admin = requireAdminClient();
    if (input.isDefault) {
      await admin.from("addresses").update({ is_default: false }).eq("owner_user_id", user.id);
    }
    const { data, error } = await admin
      .from("addresses")
      .insert({
        owner_user_id: user.id,
        label: input.label,
        recipient_name: input.recipientName,
        phone: input.phone,
        region: input.region,
        city: input.city,
        address_hint: input.addressHint,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        is_default: input.isDefault,
      })
      .select("id, label, recipient_name, phone, region, city, address_hint, is_default")
      .single();
    if (error) throw error;
    return apiSuccess(data, { status: 201, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) throw new ApiError(400, "ADDRESS_ID_REQUIRED", "Adresse manquante.");
    const { user } = await requireUser();
    const admin = requireAdminClient();
    if (body.archive === true) {
      const { error } = await admin
        .from("addresses")
        .update({ archived_at: new Date().toISOString(), is_default: false })
        .eq("id", id)
        .eq("owner_user_id", user.id);
      if (error) throw error;
      return apiSuccess({ archived: true }, { requestId });
    }
    const input = addressInputSchema.parse(body);
    if (input.isDefault) {
      await admin.from("addresses").update({ is_default: false }).eq("owner_user_id", user.id);
    }
    const { data, error } = await admin
      .from("addresses")
      .update({
        label: input.label,
        recipient_name: input.recipientName,
        phone: input.phone,
        region: input.region,
        city: input.city,
        address_hint: input.addressHint,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        is_default: input.isDefault,
      })
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "ADDRESS_NOT_FOUND", "Adresse introuvable.");
    return apiSuccess({ id }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
