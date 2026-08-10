export const LOYALTY_EARN_XOF_PER_POINT = 100;
export const LOYALTY_POINT_VALUE_XOF = 1;
export const LOYALTY_MAX_REDEMPTION_BPS = 2_000;

export function calculateLoyaltyQuote(subtotalXof: number, balancePoints: number, applyLoyalty: boolean) {
  const safeSubtotal = Math.max(0, Math.floor(subtotalXof));
  const availablePoints = Math.max(0, Math.floor(balancePoints));
  const maximumDiscountXof = Math.floor((safeSubtotal * LOYALTY_MAX_REDEMPTION_BPS) / 10_000);
  const pointsApplied = applyLoyalty ? Math.min(availablePoints, maximumDiscountXof) : 0;
  const loyaltyDiscountXof = pointsApplied * LOYALTY_POINT_VALUE_XOF;
  return {
    availablePoints,
    pointsApplied,
    loyaltyDiscountXof,
    pointsEarnable: Math.floor((safeSubtotal - loyaltyDiscountXof) / LOYALTY_EARN_XOF_PER_POINT),
  };
}
