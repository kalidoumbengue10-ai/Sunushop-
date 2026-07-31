import type { DeliveryOption } from "./types";

export const DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    id: "standard",
    title: "Livraison standard",
    description: "Le meilleur prix pour une remise aujourd’hui.",
    promise: "Aujourd’hui · 20:15–20:45",
    fee: 1_500,
    icon: "truck",
  },
  {
    id: "express",
    title: "Livraison express",
    description: "Un livreur prioritaire dès que la commande est prête.",
    promise: "Aujourd’hui · 19:35–19:50",
    fee: 2_500,
    icon: "express",
  },
  {
    id: "scheduled",
    title: "Livraison planifiée",
    description: "Choisissez un créneau qui vous convient.",
    promise: "Créneau au choix",
    fee: 1_800,
    icon: "calendar",
  },
];
