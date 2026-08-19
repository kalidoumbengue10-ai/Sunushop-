import { expect, test } from "@playwright/test";

test("le client conserve le retour commande et peut vérifier son mot de passe", async ({ page }) => {
  await page.goto("/connexion?profil=client&next=/commander");

  const buyLink = page.getByRole("link", { name: "Acheter" });
  const href = await buyLink.getAttribute("href");
  expect(new URL(href!, "https://sunushop.test").searchParams.get("next")).toBe("/commander");

  const password = page.getByLabel("Mot de passe", { exact: true });
  await password.fill("mot-de-passe-visible");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("mot-de-passe-visible");
  await page.getByRole("button", { name: "Masquer le mot de passe" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("le commerçant peut vérifier son mot de passe de connexion", async ({ page }) => {
  await page.goto("/connexion?profil=vendeur&next=/marchand");

  const password = page.getByLabel("Mot de passe", { exact: true });
  await password.fill("mot-de-passe-commercant");
  await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("mot-de-passe-commercant");
});
