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
    body: JSON.stringify({ data: { displayName: "Moussa", maskedPhone: "+22177•••••01", shopName: "Marché Dakar", location: "Dakar", expiresAt: new Date(Date.now() + 86_400_000).toISOString() } }),
  }));
});

test("l'invitation reste lisible et actionnable sur chaque taille d'écran", async ({ page }, testInfo) => {
  await page.goto(`/livreur/invitation?token=${token}`);
  await expect(page.getByRole("heading", { name: "Bienvenue Moussa" })).toBeVisible();
  await expect(page.getByText("Aucun compte, aucun mot de passe et aucun document.")).toBeVisible();
  const button = page.getByRole("button", { name: "Ouvrir ma mission" });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const card = await page.locator(".courier-access-card").boundingBox();
  expect(card?.x ?? 0).toBeGreaterThanOrEqual(15);
  await page.screenshot({ path: resolve(captureDir, `invitation-${testInfo.project.name}.png`), fullPage: true });
});

test("l'erreur d'ouverture du lien reste dans la page", async ({ page }) => {
  await page.route("**/api/courier/access/activate", (route) => route.fulfill({ status: 410, contentType: "application/json", body: JSON.stringify({ error: { message: "Ce lien a expiré." } }) }));
  await page.goto(`/livreur/invitation?token=${token}`);
  await page.getByRole("button", { name: "Ouvrir ma mission" }).click();
  await expect(page.locator(".mvp-alert--error")).toContainText("Ce lien a expiré");
});

test("la page d'accès explique seulement le lien WhatsApp", async ({ page }) => {
  await page.goto("/livreur/connexion");
  await expect(page.getByRole("heading", { name: "Ouvrez le lien WhatsApp" })).toBeVisible();
  await expect(page.getByText("Vous n’avez rien à créer ni à mémoriser.")).toBeVisible();
  await expect(page.locator("input")).toHaveCount(0);
});
