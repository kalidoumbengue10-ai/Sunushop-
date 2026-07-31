export type SubscriptionPlanId = "trial" | "essential" | "pro" | "network";

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
    id: "trial",
    name: "Essai accompagné",
    monthlyPrice: 0,
    productLimit: 20,
    positioning: "Valider le catalogue et une première zone pendant 30 jours.",
    zeroCommission: true,
  },
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
