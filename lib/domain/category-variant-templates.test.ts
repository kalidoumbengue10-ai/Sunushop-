import { describe, expect, it } from "vitest";
import { CATEGORY_VARIANT_TEMPLATES, DEFAULT_VARIANT_TEMPLATE, suggestedAxesForCategory } from "./category-variant-templates";

// Doit rester alignée avec MAX_AXES dans components/merchant-product-wizard.tsx.
const MAX_AXES = 4;

const REAL_CATEGORY_SLUGS = [
  "alimentation-boissons",
  "mode-accessoires",
  "beaute-bien-etre",
  "maison-decoration",
  "electronique-telephonie",
  "bebe-enfants",
  "sports-loisirs",
  "artisanat-culture",
  "restaurant",
  "autres-produits",
];

describe("suggestedAxesForCategory", () => {
  it("retourne le modèle par défaut pour une catégorie inconnue ou absente", () => {
    expect(suggestedAxesForCategory(undefined)).toEqual(DEFAULT_VARIANT_TEMPLATE);
    expect(suggestedAxesForCategory("categorie-inexistante")).toEqual(DEFAULT_VARIANT_TEMPLATE);
  });

  it("a un modèle défini pour chaque catégorie réelle du marketplace", () => {
    for (const slug of REAL_CATEGORY_SLUGS) {
      expect(CATEGORY_VARIANT_TEMPLATES[slug]).toBeDefined();
      expect(CATEGORY_VARIANT_TEMPLATES[slug]!.length).toBeGreaterThan(0);
    }
  });

  it("ne dépasse jamais le nombre maximal d'axes autorisés", () => {
    for (const axes of Object.values(CATEGORY_VARIANT_TEMPLATES)) {
      expect(axes.length).toBeLessThanOrEqual(MAX_AXES);
    }
    expect(DEFAULT_VARIANT_TEMPLATE.length).toBeLessThanOrEqual(MAX_AXES);
  });

  it("propose Poids/Volume pour l'alimentation plutôt que Taille/Couleur", () => {
    const axes = suggestedAxesForCategory("alimentation-boissons").map((axis) => axis.name);
    expect(axes).toContain("Poids");
    expect(axes).toContain("Volume");
  });

  it("propose une seule suggestion Portion pour le restaurant, pas Taille/Couleur", () => {
    const axes = suggestedAxesForCategory("restaurant");
    expect(axes.map((axis) => axis.name)).toEqual(["Portion"]);
  });
});
