import { beforeEach, describe, expect, it } from "vitest";
import { CHECKOUT_DRAFT_KEY, LEGACY_CHECKOUT_DRAFT_KEY, clearCheckoutDraft, readCheckoutDraft, saveCheckoutDraft } from "./checkout-draft";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

const draft = {
  recipient: { name: "Awa Diop", phone: "+221771234567", region: "Dakar", city: "Dakar", addressHint: "Villa 12" },
  groups: [{ merchantId: "m-1", deliveryZoneId: "z-1", methodKind: "merchant_delivery" as const, paymentMethod: "wave_direct" as const }],
};

describe("checkout draft persistence", () => {
  beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
  });

  it("écrit puis relit un brouillon valide", () => {
    saveCheckoutDraft(draft);
    expect(readCheckoutDraft()).toEqual(draft);
  });

  it("retourne null quand aucun brouillon n’est présent", () => {
    expect(readCheckoutDraft()).toBeNull();
  });

  it("retourne null et nettoie le stockage si le contenu est corrompu", () => {
    localStorage.setItem(CHECKOUT_DRAFT_KEY, "{not-json");
    expect(readCheckoutDraft()).toBeNull();
    expect(localStorage.getItem(CHECKOUT_DRAFT_KEY)).toBeNull();
  });

  it("efface le brouillon", () => {
    saveCheckoutDraft(draft);
    clearCheckoutDraft();
    expect(readCheckoutDraft()).toBeNull();
  });

  it("migre un ancien brouillon sans coordonnées sans perdre le panier", () => {
    localStorage.setItem(LEGACY_CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    expect(readCheckoutDraft()).toEqual(draft);
    expect(localStorage.getItem(CHECKOUT_DRAFT_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_CHECKOUT_DRAFT_KEY)).toBeNull();
  });
});
