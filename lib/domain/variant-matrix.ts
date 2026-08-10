export type VariantOptionAxis = { name: string; values: string[] };

export function parseVariantValues(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(/[,;\n]+/)
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLocaleLowerCase("fr");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function computeVariantMatrix(axes: VariantOptionAxis[]): Array<Record<string, string>> | null {
  const filledAxes = axes.filter((axis) => axis.name.trim() && axis.values.length);
  if (!filledAxes.length) return null;
  return filledAxes.reduce<Array<Record<string, string>>>(
    (combinations, axis) => combinations.flatMap((combo) => axis.values.map((value) => ({ ...combo, [axis.name.trim()]: value }))),
    [{}],
  );
}
