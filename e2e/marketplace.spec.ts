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
  await page.getByRole("link", { name: /Déposer ma candidature/i }).last().click();
  await expect(page).toHaveURL(/devenir-marchand/);
});

test("la candidature réelle alimente le CRM et propose la lettre d’intention", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/candidatures/marchands", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { id: "lead-test", status: "new", alreadyKnown: false } }) });
  });
  await page.goto("/devenir-marchand");
  await expect(page.getByRole("link", { name: /Télécharger la lettre d’intention/i })).toHaveAttribute("download", "Lettre-intention-SunuShop.html");
  await expect(page.getByText(/identifiant URL/i)).toHaveCount(0);
  await expect(page.getByLabel("Mode & accessoires")).toBeVisible();
  await page.getByLabel("Nom et prénom").fill("Awa Ndiaye");
  await page.getByLabel("Nom du commerce").fill("Atelier Test");
  await page.getByLabel("Adresse email").fill("awa@example.test");
  await page.getByLabel("Téléphone").fill("+221770000000");
  await page.getByLabel("Statut de l’activité").selectOption("informal");
  await page.getByLabel(/Comment vendez-vous/).fill("Boutique et WhatsApp");
  await page.getByLabel(/J’accepte/).check();
  await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await expect(page.getByText(/Votre candidature est enregistrée/i)).toBeVisible();
  expect(submitted).toMatchObject({ shopName: "Atelier Test", businessType: "informal", salesChannel: "Boutique et WhatsApp", consent: true });
});

test("commerçants et livreurs ne peuvent pas s’inscrire librement", async ({ page }) => {
  await page.goto("/connexion?profil=vendeur&next=/marchand&mode=inscription");
  await expect(page.getByRole("button", { name: /Je crée mon compte/i })).toHaveCount(0);
  await expect(page.getByText(/après une invitation/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Déposer une candidature/i })).toBeVisible();
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
