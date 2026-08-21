export function courierWhatsappUrl(phone: string, invitationUrl: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 9) digits = `221${digits}`;
  const message = `Bonjour, touchez ce lien personnel SunuShop pour ouvrir directement votre mission : ${invitationUrl}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function courierSmsUrl(phone: string, invitationUrl: string) {
  const message = `SunuShop : touchez ce lien personnel pour ouvrir directement votre mission : ${invitationUrl}`;
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}
