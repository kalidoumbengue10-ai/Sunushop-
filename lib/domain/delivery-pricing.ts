export function highestCategoryDeliveryFee(
  regionalFeeXof: number,
  categoryIds: string[],
  rates: Array<{ categoryId: string; feeXof: number }>,
) {
  const byCategory = new Map(rates.map((rate) => [rate.categoryId, rate.feeXof]));
  return Math.max(regionalFeeXof, ...categoryIds.map((categoryId) => byCategory.get(categoryId) ?? regionalFeeXof));
}
