import { describe, expect, it } from "vitest";
import { addCartLine, clampCartQuantity, mergeCarts, setCartLineQuantity } from "./cart";
import type { CatalogItem } from "./repositories";

function product(id: string, stock = 5): CatalogItem {
  const variant = { id, sku: id, title: "M", attributes: { Taille: "M" }, priceXof: 1000, compareAtPriceXof: null, availableQuantity: stock };
  return { id: `p-${id}`, title: id, slug: id, description: id, category: { id: "c", name: "Mode", slug: "mode" }, merchant: { id: "m", name: "Marchand", slug: "marchand", city: null }, variant, variants: [variant], imageUrl: null };
}

describe("cart domain", () => {
  it("borne toujours la quantité par le stock et par 99", () => {
    expect(clampCartQuantity(12, 5)).toBe(5);
    expect(clampCartQuantity(150, 150)).toBe(99);
    expect(clampCartQuantity(1, 0)).toBe(0);
  });

  it("additionne puis modifie une ligne sans dépasser le stock", () => {
    const added = addCartLine([{ product: product("v", 5), quantity: 3 }], product("v", 5), 4);
    expect(added[0].quantity).toBe(5);
    expect(setCartLineQuantity(added, "v", 2)[0].quantity).toBe(2);
  });

  it("fusionne local et distant avec le maximum, plafonné au stock", () => {
    const merged = mergeCarts(
      [{ product: product("v", 4), quantity: 3 }],
      [{ product: product("v", 4), quantity: 9 }, { product: product("w", 2), quantity: 1 }],
    );
    expect(merged.map((line) => [line.product.variant.id, line.quantity])).toEqual([["v", 4], ["w", 1]]);
  });
});
