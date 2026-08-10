import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/marche",
  "/categories",
  "/recherche",
  "/connexion",
  "/creer-ma-boutique",
  "/devenir-marchand",
  "/commander",
  "/aide",
  "/partenaires",
];
const VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

for (const route of ROUTES) {
  test(`${route} ne déborde pas horizontalement à 320/768/1440px`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[VIEWPORTS.length - 1]);
    await page.goto(route);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} déborde à ${viewport.width}px`).toBeLessThanOrEqual(1);

      const wrappedActions = await page
        .locator(
          ".mvp-button, .primary-button, .secondary-button, .light-button, .admin-primary-button, .admin-secondary-button, .admin-danger-button",
        )
        .evaluateAll((actions) =>
          actions
            .filter((action) => {
              const element = action as HTMLElement;
              return element.getClientRects().length > 0 && getComputedStyle(element).whiteSpace !== "nowrap";
            })
            .map((action) => (action.textContent ?? "").trim()),
        );
      expect(wrappedActions, `boutons sur plusieurs lignes dans ${route} à ${viewport.width}px`).toEqual([]);
    }
  });
}
