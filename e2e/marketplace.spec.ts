import { expect, test } from "@playwright/test";

test("l’accueil explique l’achat et oriente les commerçants sans formulaire intrusif", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Vos commerces de confiance/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Produits disponibles maintenant/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Vous aussi, vous souhaitez vendre/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Envoyer ma candidature/i })).toHaveCount(0);
  await expect(page.getByText("Maison Awa")).toHaveCount(0);
  await expect(page.getByText("Dakar Tech")).toHaveCount(0);
  await page.getByRole("group", { name: /Filtrer par catégorie/i }).getByRole("button", { name: "Toutes" }).click();
  await page.getByRole("link", { name: /Créer ma boutique/i }).last().click();
  await expect(page).toHaveURL(/creer-ma-boutique/);
});

test("le premier écran de l’inscription collecte les informations du commerce en une fois", async ({ page }) => {
  await page.goto("/creer-ma-boutique");
  await expect(page.getByRole("heading", { name: /Ouvrez votre boutique SunuShop en une seule fois/i })).toBeVisible();
  await expect(page.getByText(/Aucun email à confirmer/i)).toHaveCount(0);
  await expect(page.getByLabel("Mode & accessoires")).toBeVisible();
  await page.getByLabel("Nom et prénom").fill("Awa Ndiaye");
  await page.getByLabel("Nom du commerce").fill("Atelier Test");
  await page.getByLabel("Téléphone").fill("+221770000000");
  await page.getByLabel("Statut de l’activité").selectOption("informal");
  await page.getByLabel(/Comment vendez-vous/).fill("Boutique et WhatsApp");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Votre accès" })).toBeVisible();
  await expect(page.getByText(/Aucun email à confirmer/i)).toBeVisible();
});

test("commerçants et livreurs ne peuvent pas s’inscrire librement via le formulaire générique", async ({ page }) => {
  await page.goto("/connexion?profil=vendeur&next=/marchand&mode=inscription");
  await expect(page.getByRole("button", { name: /Je crée mon compte/i })).toHaveCount(0);
  await expect(page.getByText(/après une invitation/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Créer ma boutique/i }).first()).toBeVisible();
  await page.goto("/partenaires");
  await expect(page).toHaveURL(/\/marchand|\/connexion/);
});

test("l’accueil reste utilisable sur mobile, tablette et desktop", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("heading", { name: /Vos commerces de confiance/i })).toBeVisible();
    if (viewport.width <= 850) {
      await page.getByRole("button", { name: /Menu/i }).click();
      await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveClass(/is-open/);
    }
  }
});
