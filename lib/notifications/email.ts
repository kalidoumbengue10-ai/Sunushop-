import "server-only";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderNotificationEmail(template: string, payload: Record<string, unknown>) {
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
    subject: isCourier ? "Invitation livreur SunuShop" : "Complétez votre dossier commerçant SunuShop",
    html: `<h1>${isCourier ? "Rejoignez les livraisons de votre boutique" : "Créez votre espace sécurisé de vérification"}</h1><p>${isCourier ? "Cette invitation" : "Votre candidature a bien été reçue. Créez votre mot de passe puis déposez votre pièce d’identité, la lettre d’intention remplie et vos justificatifs."}</p><p>Ce lien est valable sept jours.</p><p><a href="${escapeHtml(payload.url)}">${isCourier ? "Créer ou ouvrir mon compte" : "Créer mon compte et déposer mes documents"}</a></p>${isCourier ? "" : "<p>Votre boutique sera accessible uniquement après validation du dossier par SunuShop.</p>"}`,
  };
}

export async function sendNotificationEmail(template: string, payload: Record<string, unknown>) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY_REQUIRED");
  const to = String(payload.to ?? "");
  if (!to) throw new Error("EMAIL_RECIPIENT_REQUIRED");
  const content = renderNotificationEmail(template, payload);
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
}
