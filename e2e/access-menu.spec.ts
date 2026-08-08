import { expect, test } from "@playwright/test";

test("le menu de connexion expose les espaces client, marchand et admin au clavier et sur mobile", async ({ page }) => {
  await page.goto("/");
  const mobileMenu = page.getByRole("button", { name: "Menu" });
  if (await mobileMenu.isVisible()) await mobileMenu.click();

  const trigger = page.getByRole("button", { name: /Se connecter/ });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: /Client/ })).toHaveAttribute("href", "/connexion?profil=client&next=/client");
  await expect(page.getByRole("menuitem", { name: /Marchand/ })).toHaveAttribute("href", "/connexion?profil=vendeur&next=/marchand");
  await expect(page.getByRole("menuitem", { name: /Admin/ })).toHaveAttribute("href", "/connexion?profil=admin&next=/admin/crm");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Choisir un espace de connexion" })).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("menuitem", { name: /Client/ }).click();
  await expect(page).toHaveURL(/\/connexion\?profil=client&next=%2Fclient|\/connexion\?profil=client&next=\/client/);
  await expect(page.getByRole("link", { name: "Acheter" })).toHaveClass(/is-active/);
});
