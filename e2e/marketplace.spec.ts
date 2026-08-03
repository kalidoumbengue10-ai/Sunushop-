import { expect, test } from "@playwright/test";

test("l’accueil n’affiche aucune donnée marchande fictive", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Des boutiques réelles/i })).toBeVisible();
  await expect(page.getByText("Maison Awa")).toHaveCount(0);
  await expect(page.getByText("Dakar Tech")).toHaveCount(0);
  await expect(page.getByText(/Aucun produit public pour le moment/i)).toBeVisible();
});

test("la préinscription alimente le CRM via l’API publique", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/prelaunch", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "lead-test", status: "new", alreadyKnown: false } }),
    });
  });
  await page.goto("/");
  await page.getByLabel("Nom et prénom").fill("Awa Ndiaye");
  await page.getByLabel("Nom de la boutique").fill("Atelier Test");
  await page.getByLabel("Email").last().fill("awa@example.test");
  await page.getByLabel("Téléphone").last().fill("+221770000000");
  await page.getByLabel(/J’accepte/).check();
  await page.getByRole("button", { name: "Envoyer ma préinscription" }).click();
  await expect(page.getByText(/demande a bien été transmise/i)).toBeVisible();
  expect(submitted).toMatchObject({ shopName: "Atelier Test", consent: true });
});
