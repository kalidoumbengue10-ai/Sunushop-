export function calculateOrderTotalXof(
  productSubtotalXof: number,
  deliveryFeeXof: number,
  discountXof = 0,
) {
  return productSubtotalXof - discountXof + deliveryFeeXof;
}
