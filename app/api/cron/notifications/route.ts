import { requireAdminClient } from "@/lib/api/auth";
import { requireCron } from "@/lib/api/cron";
import { apiFailure, apiSuccess } from "@/lib/api/response";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render(template: string, payload: Record<string, unknown>) {
  if (template === "merchant_application_received") {
    return {
      subject: `Nouvelle candidature SunuShop — ${String(payload.shopName ?? "boutique")}`,
      html: `<h1>Nouvelle candidature commerçant</h1><p><strong>${escapeHtml(payload.contactName)}</strong> souhaite référencer ${escapeHtml(payload.shopName)}.</p><p>Email : ${escapeHtml(payload.email)}<br>Téléphone : ${escapeHtml(payload.phone)}</p>`,
    };
  }
  if (template === "prelaunch_lead_received") {
    return {
      subject: `Nouveau contact SunuShop — ${String(payload.shopName ?? "boutique")}`,
      html: `<h1>Nouveau contact de pré-lancement</h1><p><strong>${escapeHtml(payload.contactName)}</strong> souhaite référencer ${escapeHtml(payload.shopName)}.</p><p>Email : ${escapeHtml(payload.email)}<br>Téléphone : ${escapeHtml(payload.phone)}</p>`,
    };
  }
  const isCourier = template === "courier_invitation";
  return {
    subject: isCourier ? "Invitation livreur SunuShop" : "Invitation commerçant SunuShop",
    html: `<h1>${isCourier ? "Rejoignez les livraisons de votre boutique" : "Complétez votre candidature SunuShop"}</h1><p>Cette invitation est valable sept jours.</p><p><a href="${escapeHtml(payload.url)}">Créer ou ouvrir mon compte</a></p>`,
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    requireCron(request);
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY_REQUIRED");
    const admin = requireAdminClient();
    const { data: pending, error } = await admin
      .from("notification_outbox")
      .select("id, template, payload, attempts")
      .eq("channel", "email")
      .in("status", ["pending", "failed"])
      .lte("available_at", new Date().toISOString())
      .lt("attempts", 5)
      .order("created_at")
      .limit(25);
    if (error) throw error;

    let sent = 0;
    for (const item of pending ?? []) {
      const payload = item.payload as Record<string, unknown>;
      const to = String(payload.to ?? "");
      const content = render(item.template, payload);
      await admin.from("notification_outbox").update({ status: "processing" }).eq("id", item.id);
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: process.env.SUNUSHOP_EMAIL_FROM ?? "SunuShop <noreply@sunushop.fr>",
            to: [to],
            subject: content.subject,
            html: content.html,
          }),
        });
        if (!response.ok) throw new Error(`RESEND_${response.status}`);
        await admin
          .from("notification_outbox")
          .update({ status: "sent", attempts: item.attempts + 1, processed_at: new Date().toISOString(), last_error: null })
          .eq("id", item.id);
        sent += 1;
      } catch (sendError) {
        const attempts = item.attempts + 1;
        await admin
          .from("notification_outbox")
          .update({
            status: "failed",
            attempts,
            available_at: new Date(Date.now() + Math.min(86_400_000, 60_000 * 2 ** attempts)).toISOString(),
            last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "SEND_FAILED",
          })
          .eq("id", item.id);
      }
    }
    return apiSuccess({ processed: pending?.length ?? 0, sent }, { requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
