import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const token = "t".repeat(48);
const captureDir = resolve(process.cwd(), "reports", "e2e", "courier");
mkdirSync(captureDir, { recursive: true });

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/courier\/access\/invitation\?token=/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { displayName: "Moussa", maskedPhone: "+22177•••••01", shopName: "Marché Dakar", location: "Dakar", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), mode: "set_pin" } }),
  }));
});

test("l'invitation reste lisible et actionnable sur chaque taille d'écran", async ({ page }, testInfo) => {
  await page.goto(`/livreur/invitation?token=${token}`);
  await expect(page.getByRole("heading", { name: "Bienvenue Moussa" })).toBeVisible();
  await expect(page.getByText("Aucun formulaire d’inscription")).toBeVisible();
  const button = page.getByRole("button", { name: "Activer et voir mes missions" });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const card = await page.locator(".courier-access-card").boundingBox();
  expect(card?.x ?? 0).toBeGreaterThanOrEqual(15);
  await page.screenshot({ path: resolve(captureDir, `invitation-${testInfo.project.name}.png`), fullPage: true });
});

test("le PIN est saisi deux fois au premier accès et l'erreur reste dans la page", async ({ page }) => {
  await page.route("**/api/courier/access/activate", (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: { message: "Les deux PIN ne correspondent pas." } }) }));
  await page.goto(`/livreur/invitation?token=${token}`);
  await page.getByLabel("Choisissez votre PIN à 6 chiffres").fill("123456");
  await page.getByLabel("Confirmez le PIN").fill("123456");
  await page.getByRole("button", { name: "Activer et voir mes missions" }).click();
  await expect(page.locator(".mvp-alert--error")).toContainText("Les deux PIN ne correspondent pas");
});

test("la connexion téléphone et PIN n'utilise aucun mot de passe visible", async ({ page }) => {
  await page.route("**/api/courier/access/sign-in", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "Téléphone ou PIN incorrect." } }) }));
  await page.goto("/livreur/connexion");
  await page.getByRole("textbox", { name: "Téléphone" }).fill("770000001");
  await page.getByLabel("PIN à 6 chiffres").fill("000000");
  await page.getByRole("button", { name: "Voir mes missions" }).click();
  await expect(page.locator(".mvp-alert--error")).toContainText("Téléphone ou PIN incorrect");
  await expect(page.getByText("PIN oublié ?")).toBeVisible();
});
