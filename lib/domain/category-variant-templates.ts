export type VariantAxisSuggestion = { name: string; values: string };

export const CATEGORY_VARIANT_TEMPLATES: Record<string, VariantAxisSuggestion[]> = {
  "mode-accessoires": [
    { name: "Taille", values: "S, M, L, XL" },
    { name: "Couleur", values: "Noir, Blanc, Rouge" },
    { name: "Pointure", values: "38, 39, 40, 41, 42" },
  ],
  "alimentation-boissons": [
    { name: "Poids", values: "250 g, 500 g, 1 kg" },
    { name: "Volume", values: "33 cl, 50 cl, 1 L" },
    { name: "Saveur", values: "" },
  ],
  "beaute-bien-etre": [
    { name: "Contenance", values: "30 ml, 50 ml, 100 ml" },
    { name: "Type de peau", values: "Normale, Sèche, Grasse" },
  ],
  "maison-decoration": [
    { name: "Taille", values: "" },
    { name: "Couleur", values: "" },
    { name: "Matière", values: "Bois, Métal, Tissu" },
  ],
  "electronique-telephonie": [
    { name: "Couleur", values: "Noir, Blanc, Gris" },
    { name: "Capacité", values: "64 Go, 128 Go, 256 Go" },
  ],
  "bebe-enfants": [
    { name: "Âge", values: "0-6 mois, 6-12 mois, 1-2 ans" },
    { name: "Taille", values: "" },
    { name: "Couleur", values: "" },
  ],
  "sports-loisirs": [
    { name: "Taille", values: "" },
    { name: "Couleur", values: "" },
    { name: "Poids", values: "" },
  ],
  "artisanat-culture": [
    { name: "Taille", values: "" },
    { name: "Couleur", values: "" },
  ],
  restaurant: [
    { name: "Portion", values: "Petite, Moyenne, Grande" },
  ],
  "autres-produits": [
    { name: "Taille", values: "" },
    { name: "Couleur", values: "" },
  ],
};

export const DEFAULT_VARIANT_TEMPLATE: VariantAxisSuggestion[] = [
  { name: "Taille", values: "" },
  { name: "Couleur", values: "" },
];

export function suggestedAxesForCategory(categorySlug: string | undefined): VariantAxisSuggestion[] {
  if (!categorySlug) return DEFAULT_VARIANT_TEMPLATE;
  return CATEGORY_VARIANT_TEMPLATES[categorySlug] ?? DEFAULT_VARIANT_TEMPLATE;
}
