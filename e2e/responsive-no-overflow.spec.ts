import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/marche", "/connexion", "/commander"];
const VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

for (const route of ROUTES) {
  test(`${route} ne déborde pas horizontalement à 320/768/1440px`, async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} déborde à ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  });
}
