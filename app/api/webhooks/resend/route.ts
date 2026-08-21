import { createHash, createHmac } from "node:crypto";
import { requireAdminClient } from "@/lib/api/auth";
import { constantTimeEqual } from "@/lib/api/constant-time";

function validSignature(body: string, id: string, timestamp: string, signature: string) {
  const configured = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!configured || !id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const secret = Buffer.from(configured.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((entry) => {
    const [, encoded] = entry.split(",");
    if (!encoded) return false;
    const received = Buffer.from(encoded, "base64");
    return constantTimeEqual(received, expected);
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const eventId = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  if (!validSignature(body, eventId, timestamp, signature)) return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
  const admin = requireAdminClient();
  const hash = createHash("sha256").update(body).digest("hex");
  const { error: eventError } = await admin.from("webhook_events").insert({ provider: "resend", provider_event_id: eventId, payload_sha256: hash, payload: event as never });
  if (eventError?.code === "23505") return Response.json({ ok: true, duplicate: true });
  if (eventError) throw eventError;
  const state = event.type === "email.delivered" ? "delivered" : ["email.bounced", "email.complained", "email.failed"].includes(event.type ?? "") ? "failed" : null;
  if (state && event.data?.email_id) {
    const eventAt = new Date(Number(timestamp) * 1000).toISOString();
    await (admin as any).from("notification_outbox").update({ delivery_state: state, delivered_at: state === "delivered" ? eventAt : null, bounced_at: state === "failed" ? eventAt : null, last_error: state === "failed" ? event.type : null }).eq("provider_message_id", event.data.email_id);
  }
  await admin.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "resend").eq("provider_event_id", eventId);
  return Response.json({ ok: true });
}
