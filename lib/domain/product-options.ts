import type { CatalogItem } from "@/lib/domain/repositories";

export type CatalogVariant = CatalogItem["variants"][number];

export function productOptionNames(variants: CatalogVariant[]) {
  return [...new Set(variants.flatMap((variant) => Object.keys(variant.attributes)))];
}

export function productOptionValues(variants: CatalogVariant[], name: string) {
  return [...new Set(variants.map((variant) => variant.attributes[name]).filter(Boolean))];
}

export function resolveProductVariant(variants: CatalogVariant[], selected: Record<string, string>) {
  return variants.find((variant) => Object.entries(selected).every(([name, value]) => variant.attributes[name] === value));
}

export function optionValueAvailable(
  variants: CatalogVariant[],
  selected: Record<string, string>,
  optionName: string,
  value: string,
) {
  const wanted = { ...selected, [optionName]: value };
  return variants.some((variant) =>
    variant.availableQuantity > 0 &&
    Object.entries(wanted).every(([name, option]) => !option || variant.attributes[name] === option),
  );
}
