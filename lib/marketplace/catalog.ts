import type {
  FaqItem,
  MarketplaceCategory,
  MerchantPreview,
  Product,
} from "./types";

export const PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Chemise wax Ndar",
    category: "Prêt-à-porter",
    price: 18_500,
    oldPrice: 22_000,
    image: "/images/wax-shirt-product.png",
    merchant: "Maison Awa",
    rating: 4.9,
    reviews: 48,
    badge: "Coup de cœur",
  },
  {
    id: 2,
    name: "Casque sans fil",
    category: "Électronique",
    price: 24_900,
    oldPrice: 29_500,
    image: "/images/electronics-bundle.png",
    merchant: "Dakar Tech",
    rating: 4.7,
    reviews: 92,
    badge: "Livraison rapide",
  },
  {
    id: 3,
    name: "Panier légumes frais",
    category: "Alimentaire",
    price: 7_500,
    image: "/images/vegetable-basket.png",
    merchant: "Marché Frais",
    rating: 4.8,
    reviews: 126,
    badge: "Zone limitée",
  },
  {
    id: 4,
    name: "Pack énergie mobile",
    category: "Électronique",
    price: 16_500,
    image: "/images/electronics-bundle.png",
    merchant: "Dakar Tech",
    rating: 4.6,
    reviews: 64,
  },
  {
    id: 5,
    name: "Ensemble coton naturel",
    category: "Prêt-à-porter",
    price: 21_000,
    image: "/images/cotton-outfit-product.png",
    merchant: "Atelier Teranga",
    rating: 4.9,
    reviews: 37,
    badge: "Nouveau",
  },
  {
    id: 6,
    name: "Panier Yassa à cuisiner",
    category: "Alimentaire",
    price: 9_500,
    image: "/images/yassa-ingredients.png",
    merchant: "Marché Frais",
    rating: 4.8,
    reviews: 81,
    badge: "Ingrédients frais",
  },
  {
    id: 7,
    name: "Panier Thiéboudiène à cuisiner",
    category: "Alimentaire",
    price: 12_500,
    image: "/images/thieboudiene-ingredients.png",
    merchant: "Marché Frais",
    rating: 4.7,
    reviews: 55,
    badge: "Panier complet",
  },
  {
    id: 8,
    name: "Panier Mafé à cuisiner",
    category: "Alimentaire",
    price: 10_500,
    image: "/images/mafe-ingredients.png",
    merchant: "Marché Frais",
    rating: 4.8,
    reviews: 73,
    badge: "Produits du marché",
  },
];

export const CATEGORIES: MarketplaceCategory[] = [
  {
    name: "Commerçants",
    description: "Des boutiques identifiables, réunies au même endroit.",
    image: "/images/hardware-store-products.png",
    tone: "sun",
  },
  {
    name: "Prêt-à-porter",
    description: "Créateurs locaux, tailles et conditions affichées.",
    image: "/images/ready-to-wear-collection.png",
    tone: "clay",
  },
  {
    name: "Électronique",
    description: "État, accessoires, vendeurs et garanties explicités.",
    image: "/images/electronics-bundle.png",
    tone: "sage",
  },
  {
    name: "Alimentaire",
    description: "Produits et zones de livraison clairement indiqués.",
    image: "/images/vegetable-basket.png",
    tone: "green",
  },
];

export const MERCHANTS: MerchantPreview[] = [
  {
    name: "Maison Awa",
    category: "Mode locale",
    rating: "4,9",
    reviews: "48 avis",
    initials: "MA",
    color: "#b84d2d",
  },
  {
    name: "Marché Frais",
    category: "Fruits & légumes",
    rating: "4,8",
    reviews: "126 avis",
    initials: "MF",
    color: "#2f6045",
  },
  {
    name: "Dakar Tech",
    category: "Électronique",
    rating: "4,7",
    reviews: "92 avis",
    initials: "DT",
    color: "#243c31",
  },
];

export const FAQS: FaqItem[] = [
  {
    question: "Quels moyens de paiement seront disponibles ?",
    answer:
      "Le prototype présente Wave, Orange Money et la carte bancaire pour illustrer le parcours. En production, chaque option devra être reliée à un prestataire agréé, avec validation serveur et webhooks signés. Aucun paiement réel ni aucune donnée bancaire ne sont traités dans cette démonstration.",
  },
  {
    question: "Comment fonctionne le suivi en temps réel ?",
    answer:
      "L’écran de suivi montre les étapes, le livreur et une estimation d’arrivée. Une version réelle nécessitera le consentement de localisation, un service cartographique et une API sécurisée. La position ne devra être visible que par les personnes liées à la commande active.",
  },
  {
    question: "Puis-je contacter directement un marchand ?",
    answer:
      "Oui, la messagerie intégrée permet de discuter autour d’un produit ou d’une commande. Ici, les échanges restent uniquement dans votre navigateur. La future version devra ajouter comptes authentifiés, notifications, modération, pièces jointes contrôlées et protection des coordonnées personnelles.",
  },
  {
    question: "Les vendeurs et les avis sont-ils vérifiés ?",
    answer:
      "Les profils, notes et avis visibles dans ce prototype sont fictifs et clairement utilisés pour la démonstration. En production, un marchand devra passer une procédure de vérification et seuls les clients ayant reçu une commande pourront publier un avis associé à celle-ci.",
  },
];
