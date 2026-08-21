import { describe, expect, it } from "vitest";
import { clientLoginHref, conversationIntentPath } from "@/lib/domain/client-navigation";

describe("navigation client après authentification", () => {
  it("conserve la boutique exacte pour un favori", () => {
    expect(clientLoginHref("/boutiques/atelier-teranga"))
      .toBe("/connexion?profil=client&next=%2Fboutiques%2Fatelier-teranga");
  });

  it("conserve tous les éléments d'une intention de conversation", () => {
    const path = conversationIntentPath({
      merchantId: "merchant-1",
      orderId: "order-2",
      productId: "product-3",
      subject: "Question sur le café & le thé",
    });
    const url = new URL(path, "https://sunushop.local");
    expect(url.pathname).toBe("/messages");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      merchantId: "merchant-1",
      orderId: "order-2",
      productId: "product-3",
      subject: "Question sur le café & le thé",
    });
  });

  it("neutralise une redirection externe", () => {
    expect(clientLoginHref("//example.com/vol-session"))
      .toBe("/connexion?profil=client&next=%2Fclient");
  });
});
