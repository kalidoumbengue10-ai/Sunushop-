// Le plan "trial" a été retiré : il n'était pas semé dans subscription_plans
// et était rejeté par subscriptionPaymentSchema (lib/domain/schemas.ts).
// L'essai gratuit est couvert par l'activation manuelle CRM
// (admin_grant_subscription / admin_activate_test_subscription), pas par un
// plan payant fictif à 0 F.
export type SubscriptionPlanId = "essential" | "pro" | "network";

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  monthlyPrice: number;
  productLimit: number | null;
  positioning: string;
  zeroCommission: true;
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "essential",
    name: "Essentiel",
    monthlyPrice: 4_900,
    productLimit: 100,
    positioning: "Transformer les demandes sociales en commandes suivies.",
    zeroCommission: true,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 9_900,
    productLimit: 1_000,
    positioning: "Piloter plusieurs zones, une équipe et les performances.",
    zeroCommission: true,
  },
  {
    id: "network",
    name: "Réseau",
    monthlyPrice: 24_900,
    productLimit: null,
    positioning: "Gérer un catalogue étendu avec support prioritaire.",
    zeroCommission: true,
  },
];
