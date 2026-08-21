import "server-only";

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatXof(value: unknown) {
  return new Intl.NumberFormat("fr-SN", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function formatDate(value: unknown) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-SN", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Dakar" }).format(new Date(String(value)));
}

type EmailCopy = { subject: string; preheader: string; title: string; body: string; cta?: string; url?: string; details?: string[] };

function copyFor(template: string, payload: Record<string, unknown>): EmailCopy {
  const shop = escapeHtml(payload.shopName ?? payload.merchantName ?? "votre boutique");
  const order = escapeHtml(payload.orderCode ?? "");
  const amount = formatXof(payload.totalXof ?? payload.amountXof);
  const url = String(payload.url ?? "");
  switch (template) {
    case "merchant_application_received": return { subject: `Nouvelle candidature SunuShop — ${String(payload.shopName ?? "boutique")}`, preheader: "Une nouvelle candidature commerçant a été déposée.", title: "Nouvelle candidature commerçant", body: `<strong>${escapeHtml(payload.contactName)}</strong> souhaite référencer <strong>${shop}</strong>.`, details: [`E-mail : ${escapeHtml(payload.email)}`, `Téléphone : ${escapeHtml(payload.phone)}`] };
    case "prelaunch_lead_received": return { subject: `Nouveau contact SunuShop — ${String(payload.shopName ?? "boutique")}`, preheader: "Un nouveau contact souhaite rejoindre SunuShop.", title: "Nouveau contact de pré-lancement", body: `<strong>${escapeHtml(payload.contactName)}</strong> souhaite présenter <strong>${shop}</strong>.`, details: [`E-mail : ${escapeHtml(payload.email)}`, `Téléphone : ${escapeHtml(payload.phone)}`] };
    case "merchant_invitation": return { subject: `SunuShop — Votre lien sécurisé pour déposer vos documents`, preheader: `Accédez au dossier marchand de ${shop}.`, title: "Votre accès au dépôt de documents", body: `Votre candidature pour <strong>${shop}</strong> a bien été reçue. Cliquez sur le bouton ci-dessous pour créer votre mot de passe, ouvrir votre espace sécurisé et déposer les documents demandés. Ce lien personnel est valable sept jours.`, cta: "Accéder à mon dossier marchand", url };
    case "courier_invitation": return { subject: `Votre mission livreur — ${String(payload.shopName ?? "SunuShop")}`, preheader: "Touchez le lien pour ouvrir directement votre mission.", title: "Votre mission est prête", body: `<strong>${shop}</strong> souhaite vous confier des livraisons. Touchez simplement le bouton pour ouvrir votre espace. Aucun compte, aucun mot de passe et aucun document ne vous seront demandés. Ce lien personnel est valable sept jours et ne peut servir qu’une fois.`, cta: "Ouvrir mes missions", url };
    case "delivery_offer": return { subject: `Nouvelle mission — gain ${formatXof(payload.courierFeeXof)}`, preheader: `${shop} vous propose une nouvelle livraison.`, title: "Une nouvelle mission vous attend", body: `<strong>${shop}</strong> vous propose une livraison vers <strong>${escapeHtml(payload.zone ?? "la zone indiquée")}</strong>. Acceptez-la ou refusez-la en un geste depuis votre espace.`, details: [`Distance estimée : ${escapeHtml(payload.distanceLabel ?? "—")}`, `Durée estimée : ${escapeHtml(payload.durationLabel ?? "—")}`, `Votre gain : ${formatXof(payload.courierFeeXof)}`], cta: "Voir et décider", url };
    case "delivery_offer_accepted": return { subject: `Mission acceptée — ${order}`, preheader: "Le livreur a accepté votre proposition.", title: "La mission est acceptée", body: `Le livreur a accepté la mission <strong>${order}</strong>. Les coordonnées exactes du client lui sont désormais accessibles.`, cta: "Suivre la mission", url };
    case "delivery_offer_declined": return { subject: `Mission refusée — ${order}`, preheader: "La commande est de nouveau disponible à l’affectation.", title: "Le livreur a refusé la mission", body: `La proposition pour la commande <strong>${order}</strong> a été refusée. Elle est immédiatement revenue dans votre liste « À affecter ».`, cta: "Choisir un autre livreur", url };
    case "recipient_delivery_code": return { subject: `Votre code de livraison — ${order}`, preheader: "Présentez ce code au livreur uniquement lorsque vous avez votre colis.", title: "Votre colis est en route", body: `Votre commande <strong>${order}</strong> a été retirée. Lorsque le livreur est devant vous et que vous avez vérifié le colis, communiquez-lui ce code :`, details: [`Code de livraison : ${escapeHtml(payload.code)}`, "Ne partagez jamais ce code avant d’avoir reçu votre colis."], cta: "Suivre ma livraison", url };
    case "courier_payout_declared": return { subject: `Transfert déclaré — ${formatXof(payload.amountXof)}`, preheader: `${shop} a déclaré un règlement à confirmer.`, title: "Un règlement attend votre confirmation", body: `<strong>${shop}</strong> indique avoir transféré <strong>${formatXof(payload.amountXof)}</strong> sur votre compte ${escapeHtml(payload.paymentMethod ?? "de paiement")}. Confirmez la réception ou contestez-la depuis votre espace.`, details: payload.externalReference ? [`Référence : ${escapeHtml(payload.externalReference)}`] : [], cta: "Vérifier le règlement", url };
    case "order_created_buyer": return { subject: `Commande ${order} bien enregistrée`, preheader: `Votre commande de ${amount} est transmise au marchand.`, title: "Votre commande est enregistrée", body: `Le marchand a reçu votre commande <strong>${order}</strong>. Vous pourrez suivre chaque étape depuis votre espace SunuShop.`, details: [`Total : ${amount}`], cta: "Suivre ma commande", url };
    case "order_created_merchant": return { subject: `Nouvelle commande ${escapeHtml(payload.merchantOrderCode ?? order)}`, preheader: `Une nouvelle commande de ${amount} attend votre confirmation.`, title: "Vous avez une nouvelle commande", body: `La commande <strong>${escapeHtml(payload.merchantOrderCode ?? order)}</strong> attend votre confirmation de stock.`, details: [`Référence SunuShop : ${order}`, `Total : ${amount}`], cta: "Voir la commande", url };
    case "order_status_changed": return { subject: `Commande ${order} — ${String(payload.statusLabel ?? "mise à jour")}`, preheader: "Le suivi de votre commande vient d’être actualisé.", title: String(payload.statusLabel ?? "Commande mise à jour"), body: `Le statut de la commande <strong>${order}</strong> a changé.`, details: payload.publicMessage ? [escapeHtml(payload.publicMessage)] : [], cta: "Consulter le suivi", url };
    case "delivery_assigned": return { subject: `Livraison affectée — ${order}`, preheader: "Une nouvelle mission de livraison vous attend.", title: "Nouvelle mission de livraison", body: `La livraison de la commande <strong>${order}</strong> vous a été affectée. Consultez votre espace avant de vous déplacer.`, cta: "Voir la mission", url };
    case "loyalty_expiring": return { subject: `Vos points chez ${shop} expirent bientôt`, preheader: `${escapeHtml(payload.points)} points arrivent à expiration.`, title: "Utilisez vos points de fidélité", body: `<strong>${escapeHtml(payload.points)}</strong> points gagnés chez <strong>${shop}</strong> expireront le <strong>${escapeHtml(formatDate(payload.expiresAt))}</strong>.`, cta: "Voir mes points", url };
    case "verification_decision": return { subject: `Dossier marchand — ${String(payload.statusLabel ?? "décision disponible")}`, preheader: "Une décision est disponible pour votre dossier.", title: String(payload.statusLabel ?? "Votre dossier a été mis à jour"), body: escapeHtml(payload.message ?? "Consultez votre espace marchand pour connaître les prochaines étapes."), cta: "Ouvrir mon dossier", url };
    case "merchant_documents_approved": return { subject: "Votre dossier marchand SunuShop a été validé", preheader: "Vos documents sont acceptés ; l’abonnement reste nécessaire pour publier.", title: "Votre dossier documentaire est validé", body: `Bonne nouvelle : les documents transmis pour <strong>${shop}</strong> ont été validés par l’équipe SunuShop. Votre boutique n’est pas encore publiée : vous pouvez préparer votre catalogue en brouillon, mais vous devez activer un abonnement marchand avant de publier des produits et recevoir des commandes.`, cta: "Activer mon abonnement", url };
    case "subscription_activated": return { subject: "Votre abonnement SunuShop est activé", preheader: "Vous pouvez maintenant publier vos produits.", title: "Votre abonnement est actif", body: `Bonne nouvelle : l’abonnement <strong>${escapeHtml(payload.planName ?? "SunuShop")}</strong> de votre boutique est maintenant actif${payload.currentPeriodEndsAt ? ` jusqu’au <strong>${escapeHtml(formatDate(payload.currentPeriodEndsAt))}</strong>` : ""}. Vous pouvez dès maintenant ajouter vos photos, finaliser vos produits et les publier dans votre boutique.`, cta: "Ajouter et publier un produit", url };
    case "subscription_expired": return { subject: "Votre abonnement SunuShop a expiré", preheader: "La publication de vos produits est désormais suspendue.", title: "Abonnement expiré", body: "Votre abonnement marchand est arrivé à échéance. Vos brouillons et données restent disponibles, mais vos produits ne peuvent plus être publiés tant que l’abonnement n’est pas renouvelé.", cta: "Renouveler mon abonnement", url };
    case "subscription_payment_submitted": return { subject: `Nouveau paiement d’abonnement — ${shop}`, preheader: "Un paiement d’abonnement attend une vérification.", title: "Paiement d’abonnement à vérifier", body: `<strong>${shop}</strong> a transmis un paiement de <strong>${amount}</strong>.`, details: [`Référence : ${escapeHtml(payload.externalReference)}`] };
    case "verification_submitted": return { subject: `Dossier marchand à vérifier — ${shop}`, preheader: "Un commerçant a soumis son dossier complet.", title: "Nouveau dossier à examiner", body: `<strong>${shop}</strong> a soumis ses justificatifs pour validation.` };
    case "subscription_expires_j7":
    case "subscription_expires_j2": { const days = template.endsWith("j7") ? 7 : 2; return { subject: `Votre abonnement expire dans ${days} jours`, preheader: "Renouvelez votre abonnement pour garder votre boutique active.", title: "Renouvellement à prévoir", body: `Votre abonnement SunuShop arrive à échéance dans <strong>${days} jours</strong>.`, cta: "Renouveler mon abonnement", url }; }
    case "payment_declared": return { subject: `Paiement déclaré — commande ${order}`, preheader: "Un paiement attend votre vérification.", title: "Paiement à vérifier", body: `L’acheteur a déclaré un paiement de <strong>${amount}</strong> pour la commande <strong>${order}</strong>.`, details: [`Référence : ${escapeHtml(payload.externalReference)}`], cta: "Vérifier le paiement", url };
    case "payment_confirmed": return { subject: `Paiement confirmé — commande ${order}`, preheader: "Le marchand a confirmé la réception de votre paiement.", title: "Paiement confirmé", body: `Votre paiement pour la commande <strong>${order}</strong> a été confirmé par le marchand.`, cta: "Suivre ma commande", url };
    case "order_paid": return { subject: `Paiement reçu — commande ${order}`, preheader: "Le bénéficiaire a confirmé le transfert.", title: "Paiement confirmé", body: `Le paiement direct de <strong>${amount}</strong> pour la commande <strong>${order}</strong> a été confirmé par le bénéficiaire.`, cta: "Suivre la commande", url };
    case "order_dispute_opened": return { subject: `Litige ouvert — commande ${order}`, preheader: "Un litige a été signalé sur cette commande.", title: "Un litige a été signalé", body: `Un litige indépendant du paiement a été ouvert sur la commande <strong>${order}</strong> (montant : ${amount}). L’équipe SunuShop va examiner le dossier.`, details: payload.reason ? [`Motif : ${escapeHtml(payload.reason)}`] : [], cta: url ? "Consulter le dossier" : undefined, url };
    case "order_dispute_resolved": { const resolved = payload.resolution === "refund_required" ? "Un remboursement direct doit être déclaré par le marchand puis confirmé par le client." : "Aucun remboursement n’est requis."; return { subject: `Litige résolu — commande ${order}`, preheader: "L’équipe SunuShop a tranché ce litige.", title: "Le litige a été résolu", body: `Le litige concernant la commande <strong>${order}</strong> a été résolu par l’équipe SunuShop. ${resolved}`, cta: "Voir la commande", url }; }
    case "new_message": return { subject: `Nouveau message — ${escapeHtml(payload.senderLabel ?? "SunuShop")}`, preheader: "Un nouveau message vous attend dans votre messagerie SunuShop.", title: "Vous avez un nouveau message", body: `<strong>${escapeHtml(payload.senderLabel ?? "Un utilisateur")}</strong> vous a envoyé un message${payload.subject ? ` au sujet de « ${escapeHtml(payload.subject)} »` : ""}.`, cta: "Ouvrir la conversation", url };
    default: return { subject: "Notification SunuShop", preheader: "Une information vous attend dans votre espace SunuShop.", title: "Information SunuShop", body: "Connectez-vous à votre espace pour consulter cette mise à jour.", cta: url ? "Ouvrir SunuShop" : undefined, url };
  }
}

function renderEnvelope(copy: EmailCopy) {
  const details = copy.details?.length ? `<div style="margin:24px 0;padding:16px;border-radius:12px;background:#f7f4ec;color:#405149">${copy.details.map((line) => `<p style="margin:4px 0">${line}</p>`).join("")}</div>` : "";
  const cta = copy.cta && copy.url ? `<p style="margin:28px 0"><a href="${escapeHtml(copy.url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#173f2e;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(copy.cta)}</a></p>` : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(copy.subject)}</title></head><body style="margin:0;background:#f7f4ec;color:#17231d;font-family:Arial,sans-serif"><span style="display:none;max-height:0;overflow:hidden">${escapeHtml(copy.preheader)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;overflow:hidden;border-radius:20px;background:#fffdf8"><tr><td style="padding:24px 30px;background:#173f2e;color:#fff;font:700 27px Georgia,serif">Sunu<span style="color:#f1ad32">Shop</span></td></tr><tr><td style="padding:36px 30px"><p style="margin:0 0 10px;color:#b84d2d;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Marketplace sénégalaise</p><h1 style="margin:0 0 18px;font:700 34px/1.08 Georgia,serif">${escapeHtml(copy.title)}</h1><div style="font-size:16px;line-height:1.65">${copy.body}</div>${details}${cta}<p style="margin:30px 0 0;color:#69736c;font-size:12px;line-height:1.6">SunuShop — Acheter, vendre et livrer en toute confiance.<br>Si vous n’êtes pas à l’origine de cette action, contactez notre équipe.</p></td></tr></table></td></tr></table></body></html>`;
}

export function renderNotificationEmail(template: string, payload: Record<string, unknown>) {
  const copy = copyFor(template, payload);
  const text = [copy.title, copy.body.replace(/<[^>]+>/g, ""), ...(copy.details ?? []), copy.cta && copy.url ? `${copy.cta} : ${copy.url}` : "", "SunuShop — Acheter, vendre et livrer en toute confiance."].filter(Boolean).join("\n\n");
  return { subject: copy.subject, html: renderEnvelope(copy), text };
}

export async function sendNotificationEmail(
  template: string,
  payload: Record<string, unknown>,
  options: { idempotencyKey?: string } = {},
) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY_REQUIRED");
  const to = String(payload.to ?? "");
  if (!to) throw new Error("EMAIL_RECIPIENT_REQUIRED");
  const content = renderNotificationEmail(template, payload);
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const response = await fetch(process.env.SUNUSHOP_EMAIL_API_URL?.trim() || "https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({ from: process.env.SUNUSHOP_EMAIL_FROM ?? "SunuShop <noreply@sunushop.fr>", reply_to: process.env.SUNUSHOP_EMAIL_REPLY_TO ?? "contact@sunushop.fr", to: [to], subject: content.subject, html: content.html, text: content.text }),
    // Sans timeout, un Resend lent bloque indéfiniment le worker appelant :
    // fatal sur les 7 routes qui envoient en synchrone (sendImmediately).
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RESEND_${response.status}`);
  const result = await response.json().catch(() => ({})) as { id?: string };
  return { providerMessageId: result.id ?? null };
}
