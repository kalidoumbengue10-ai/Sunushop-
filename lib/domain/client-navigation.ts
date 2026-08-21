export type ConversationIntent = {
  merchantId: string;
  orderId?: string;
  productId?: string;
  subject?: string;
};

export function clientLoginHref(next: string) {
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/client";
  return `/connexion?profil=client&next=${encodeURIComponent(safeNext)}`;
}

export function conversationIntentPath(intent: ConversationIntent) {
  const params = new URLSearchParams({ merchantId: intent.merchantId });
  if (intent.orderId) params.set("orderId", intent.orderId);
  if (intent.productId) params.set("productId", intent.productId);
  if (intent.subject) params.set("subject", intent.subject);
  return `/messages?${params.toString()}`;
}
