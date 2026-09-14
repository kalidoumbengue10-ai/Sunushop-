import { safeRedirectPath } from "@/lib/domain/safe-redirect";

export type ConversationIntent = {
  merchantId: string;
  orderId?: string;
  productId?: string;
  subject?: string;
};

export function clientLoginHref(next: string) {
  return `/connexion?profil=client&next=${encodeURIComponent(safeRedirectPath(next, "/client"))}`;
}

export function conversationIntentPath(intent: ConversationIntent) {
  const params = new URLSearchParams({ merchantId: intent.merchantId });
  if (intent.orderId) params.set("orderId", intent.orderId);
  if (intent.productId) params.set("productId", intent.productId);
  if (intent.subject) params.set("subject", intent.subject);
  return `/messages?${params.toString()}`;
}
