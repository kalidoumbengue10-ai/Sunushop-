export type VariantOptionAxis = { name: string; values: string[] };

export function computeVariantMatrix(axes: VariantOptionAxis[]): Array<Record<string, string>> | null {
  const filledAxes = axes.filter((axis) => axis.name.trim() && axis.values.length);
  if (!filledAxes.length) return null;
  return filledAxes.reduce<Array<Record<string, string>>>(
    (combinations, axis) => combinations.flatMap((combo) => axis.values.map((value) => ({ ...combo, [axis.name.trim()]: value }))),
    [{}],
  );
}
