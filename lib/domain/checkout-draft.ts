export type CheckoutRecipient = {
  name: string;
  phone: string;
  region: string;
  city: string;
  addressHint: string;
  latitude?: number;
  longitude?: number;
};

export type CheckoutGroupDraft = {
  merchantId: string;
  deliveryZoneId?: string;
  methodKind: "pickup" | "merchant_delivery";
  paymentMethod: "cash_on_delivery" | "wave_direct" | "orange_money_direct";
  applyLoyalty?: boolean;
};

export type CheckoutDraft = {
  recipient: CheckoutRecipient;
  groups: CheckoutGroupDraft[];
};

export const CHECKOUT_DRAFT_KEY = "sunushop-checkout-draft-v2";
export const LEGACY_CHECKOUT_DRAFT_KEY = "sunushop-checkout-draft-v1";

function isCheckoutRecipient(value: unknown): value is CheckoutRecipient {
  if (!value || typeof value !== "object") return false;
  const recipient = value as Partial<CheckoutRecipient>;
  return (
    typeof recipient.name === "string" &&
    typeof recipient.phone === "string" &&
    typeof recipient.region === "string" &&
    typeof recipient.city === "string" &&
    typeof recipient.addressHint === "string" &&
    (recipient.latitude === undefined || typeof recipient.latitude === "number") &&
    (recipient.longitude === undefined || typeof recipient.longitude === "number") &&
    ((recipient.latitude === undefined) === (recipient.longitude === undefined))
  );
}

function isCheckoutGroupDraft(value: unknown): value is CheckoutGroupDraft {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<CheckoutGroupDraft>;
  return (
    typeof group.merchantId === "string" &&
    (group.deliveryZoneId === undefined || typeof group.deliveryZoneId === "string") &&
    (group.applyLoyalty === undefined || typeof group.applyLoyalty === "boolean") &&
    (group.methodKind === "pickup" || group.methodKind === "merchant_delivery") &&
    (group.paymentMethod === "cash_on_delivery" ||
      group.paymentMethod === "wave_direct" ||
      group.paymentMethod === "orange_money_direct")
  );
}

export function isCheckoutDraft(value: unknown): value is CheckoutDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<CheckoutDraft>;
  return (
    isCheckoutRecipient(draft.recipient) &&
    Array.isArray(draft.groups) &&
    draft.groups.every(isCheckoutGroupDraft)
  );
}

export function saveCheckoutDraft(draft: CheckoutDraft) {
  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
}

export function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const saved = localStorage.getItem(CHECKOUT_DRAFT_KEY) ?? localStorage.getItem(LEGACY_CHECKOUT_DRAFT_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!isCheckoutDraft(parsed)) return null;
    if (!localStorage.getItem(CHECKOUT_DRAFT_KEY)) {
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(parsed));
      localStorage.removeItem(LEGACY_CHECKOUT_DRAFT_KEY);
    }
    return parsed;
  } catch {
    localStorage.removeItem(CHECKOUT_DRAFT_KEY);
    localStorage.removeItem(LEGACY_CHECKOUT_DRAFT_KEY);
    return null;
  }
}

export function clearCheckoutDraft() {
  localStorage.removeItem(CHECKOUT_DRAFT_KEY);
  localStorage.removeItem(LEGACY_CHECKOUT_DRAFT_KEY);
}
