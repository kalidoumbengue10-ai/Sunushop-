import { timingSafeEqual } from "node:crypto";
import { requireAdminClient } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiFailure, apiSuccess } from "@/lib/api/response";
import { prelaunchLeadIngestSchema } from "@/lib/domain/schemas";

function secretsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 20_000) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "La demande est trop volumineuse.");
    }
    const expectedSecret = process.env.PRELAUNCH_INGEST_SECRET?.trim();
    const receivedSecret = request.headers.get("x-sunushop-ingest-secret")?.trim();
    if (!expectedSecret) {
      throw new ApiError(503, "INGEST_NOT_CONFIGURED", "La réception des candidatures est momentanément indisponible.");
    }
    if (!receivedSecret || !secretsMatch(receivedSecret, expectedSecret)) {
      throw new ApiError(401, "INVALID_INGEST_SECRET", "Requête non autorisée.");
    }

    const input = prelaunchLeadIngestSchema.parse(await request.json());
    const admin = requireAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("crm_leads")
      .select("id, status")
      .eq("email", input.email)
      .maybeSingle();
    if (existingError) throw existingError;

    const leadValues = {
      source: "prelaunch_site",
      full_name: input.name,
      business_name: input.businessName,
      email: input.email,
      phone: input.phone || null,
      city: input.city || null,
      business_type: input.businessType || null,
      sales_channel: input.salesChannel || null,
      message: input.message || null,
      metadata: { last_submission_at: input.submittedAt ?? new Date().toISOString() },
    };
    const leadQuery = existing
      ? admin.from("crm_leads").update(leadValues).eq("id", existing.id).select("id, status").single()
      : admin.from("crm_leads").insert(leadValues).select("id, status").single();
    const { data: lead, error: leadError } = await leadQuery;
    if (leadError) throw leadError;

    const { error: eventError } = await admin.from("crm_lead_events").insert({
      lead_id: lead.id,
      event_type: existing ? "submission_refreshed" : "lead_created",
      to_status: lead.status,
      summary: existing
        ? "Les informations du prospect ont été actualisées depuis le site."
        : "Candidature reçue depuis le site.",
      metadata: { source: "prelaunch_site" },
    });
    if (eventError) throw eventError;

    return apiSuccess({ leadId: lead.id, created: !existing }, { requestId, status: existing ? 200 : 201 });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
