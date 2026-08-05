import type { CatalogItem } from "@/lib/domain/repositories";

export type CartLine = {
  product: CatalogItem;
  quantity: number;
};

export const CART_STORAGE_KEY = "sunushop-live-cart-v1";

export function clampCartQuantity(quantity: number, stock: number) {
  if (!Number.isFinite(quantity) || stock < 1) return 0;
  return Math.min(Math.max(1, Math.trunc(quantity)), Math.min(stock, 99));
}

export function addCartLine(lines: CartLine[], product: CatalogItem, quantity = 1) {
  const requested = clampCartQuantity(quantity, product.variant.availableQuantity);
  if (!requested) return lines;
  const existing = lines.find((line) => line.product.variant.id === product.variant.id);
  if (!existing) return [...lines, { product, quantity: requested }];
  return lines.map((line) => line.product.variant.id === product.variant.id
    ? {
        product,
        quantity: clampCartQuantity(
          line.quantity + requested,
          product.variant.availableQuantity,
        ),
      }
    : line);
}

export function setCartLineQuantity(lines: CartLine[], variantId: string, quantity: number) {
  if (quantity <= 0) return lines.filter((line) => line.product.variant.id !== variantId);
  return lines.map((line) => line.product.variant.id === variantId
    ? { ...line, quantity: clampCartQuantity(quantity, line.product.variant.availableQuantity) }
    : line);
}

export function mergeCarts(local: CartLine[], remote: CartLine[]) {
  const merged = new Map<string, CartLine>();
  for (const line of [...remote, ...local]) {
    const id = line.product.variant.id;
    const current = merged.get(id);
    const freshest = line.product.variant.availableQuantity >= 0 ? line.product : current?.product ?? line.product;
    const quantity = clampCartQuantity(
      Math.max(current?.quantity ?? 0, line.quantity),
      freshest.variant.availableQuantity,
    );
    if (quantity) merged.set(id, { product: freshest, quantity });
  }
  return [...merged.values()];
}

export function cartItemCount(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function cartSubtotal(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity * line.product.variant.priceXof, 0);
}

export function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<CartLine>;
  return Boolean(
    line.product?.id &&
    line.product.variant?.id &&
    Number.isInteger(line.quantity) &&
    Number(line.quantity) > 0,
  );
}
