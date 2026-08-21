import { describe, expect, it } from "vitest";
import {
  defaultMerchantTab,
  merchantCanAccessTab,
  merchantTabsForRole,
} from "./merchant-ui";

describe("merchant workspace RBAC", () => {
  it("keeps owner and manager on the complete operational workspace", () => {
    expect(merchantTabsForRole("owner")).toEqual(merchantTabsForRole("manager"));
    expect(merchantCanAccessTab("owner", "abonnement")).toBe(true);
    expect(merchantCanAccessTab("manager", "dossier")).toBe(true);
  });

  it("limits catalog members to catalog and storefront media", () => {
    expect(merchantTabsForRole("catalog")).toEqual(["catalogue", "boutique"]);
    expect(merchantCanAccessTab("catalog", "commandes")).toBe(false);
  });

  it("limits fulfillment members to orders and delivery operations", () => {
    expect(merchantTabsForRole("fulfillment")).toEqual([
      "commandes",
      "livraison",
      "livreurs",
    ]);
    expect(merchantCanAccessTab("fulfillment", "catalogue")).toBe(false);
  });

  it("never exposes the hidden loyalty workspace", () => {
    for (const role of ["owner", "manager", "catalog", "fulfillment"] as const) {
      expect(merchantTabsForRole(role)).not.toContain("fidelite");
    }
  });

  it("does not send restricted roles to subscriptions by default", () => {
    expect(defaultMerchantTab("catalog", false)).toBe("catalogue");
    expect(defaultMerchantTab("fulfillment", false)).toBe("commandes");
    expect(defaultMerchantTab("owner", false)).toBe("abonnement");
  });
});
