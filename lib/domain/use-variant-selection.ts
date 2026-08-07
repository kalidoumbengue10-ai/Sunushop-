import { useState } from "react";
import type { CatalogItem } from "@/lib/domain/repositories";
import { resolveProductVariant } from "@/lib/domain/product-options";

export function useVariantSelection(product: CatalogItem) {
  const [selected, setSelected] = useState<Record<string, string>>(product.variant.attributes);
  const [quantity, setQuantity] = useState(1);
  const variant = resolveProductVariant(product.variants, selected) ?? product.variant;

  const selectOption = (name: string, value: string) => {
    const wanted = { ...selected, [name]: value };
    const exact = resolveProductVariant(product.variants, wanted);
    const compatible = exact ?? product.variants.find((candidate) =>
      candidate.availableQuantity > 0 && candidate.attributes[name] === value,
    );
    if (compatible) {
      setSelected(compatible.attributes);
      setQuantity((current) => Math.min(current, Math.max(1, compatible.availableQuantity)));
    }
  };

  return { selected, variant, quantity, setQuantity, selectOption };
}
