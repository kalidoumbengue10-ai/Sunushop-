import { expect, test } from "@playwright/test";
import { CART_STORAGE_KEY } from "../lib/domain/cart";

const merchantId = "00000000-0000-4000-8000-000000000101";
const productId = "00000000-0000-4000-8000-000000000102";
const variantId = "00000000-0000-4000-8000-000000000103";
const zoneId = "00000000-0000-4000-8000-000000000104";

test("une zone Unicode équivalente à la région choisie permet de continuer vers la connexion", async ({ page }) => {
  const cart = [{
    quantity: 1,
    product: {
      id: productId,
      title: "Produit région E2E",
      slug: "produit-region-e2e",
      description: "Produit utilisé pour le test de région de livraison.",
      optionNames: [],
      category: { id: "00000000-0000-4000-8000-000000000105", name: "Test", slug: "test" },
      merchant: { id: merchantId, name: "Boutique région E2E", slug: "boutique-region-e2e", city: "Kédougou" },
      variant: {
        id: variantId,
        sku: "REGION-E2E",
        title: "Standard",
        attributes: {},
        priceXof: 2500,
        compareAtPriceXof: null,
        availableQuantity: 5,
      },
      variants: [],
      imageUrl: null,
      imageUrls: [],
    },
  }];

  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: CART_STORAGE_KEY,
    value: JSON.stringify(cart),
  });

  await page.route("**/api/client/cart", (route) => route.fulfill({ status: 401, body: "" }));
  await page.route("**/api/client/addresses", (route) => route.fulfill({ status: 401, body: "" }));
  await page.route("**/api/client/shop-follows", (route) => route.fulfill({ status: 401, body: "" }));
  await page.route("**/api/maps/reverse**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { place: null } }),
  }));
  await page.route("**/api/shops/boutique-region-e2e", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {
      id: merchantId,
      name: "Boutique région E2E",
      slug: "boutique-region-e2e",
      phone: "+221770000000",
      email: "boutique@example.test",
      paymentMethods: { cashOnDelivery: true, wave: true, orangeMoney: false },
      // Même nom visuel que « Kédougou », avec accent décomposé et espace insécable final.
      deliveryZones: [{
        id: zoneId,
        label: "Kédougou",
        region: "Ke\u0301dougou\u00a0",
        city: null,
        feeXof: 1500,
        minDelayMinutes: 0,
        maxDelayMinutes: 1440,
      }],
      pickup: { enabled: false, hours: null, instructions: null },
      location: { addressLine: "Kédougou", latitude: 12.56, longitude: -12.18 },
    } }),
  }));

  let quoteBody: Record<string, unknown> | null = null;
  await page.route("**/api/cart/quote", async (route) => {
    quoteBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        groups: [{
          merchantId,
          merchantName: "Boutique région E2E",
          deliveryZoneId: zoneId,
          deliveryLabel: "Kédougou",
          methodKind: "merchant_delivery",
          subtotalXof: 2500,
          deliveryFeeXof: 1500,
          availablePoints: 0,
          pointsApplied: 0,
          loyaltyDiscountXof: 0,
          pointsEarnable: 0,
          loyaltyAccrualEnabled: false,
          totalXof: 4000,
        }],
        totalXof: 4000,
      } }),
    });
  });

  await page.goto("/commander");
  await expect(page.getByLabel("Zone de livraison")).toHaveValue(zoneId);
  await page.getByRole("button", { name: "Continuer vers la livraison" }).click();

  await page.getByLabel("Nom du destinataire").fill("Awa Ndiaye");
  await page.getByLabel("Téléphone").fill("+221770000000");
  await page.getByRole("combobox", { name: "Région", exact: true }).selectOption({ label: "Kédougou" });
  await page.getByLabel("Ville").fill("Kédougou");
  await page.getByLabel("Précisions d’adresse").fill("Quartier Dandé Mayo");
  await page.getByText("Saisir les coordonnées manuellement").click();
  await page.getByLabel("Latitude").fill("12.560000");
  await page.getByLabel("Longitude").fill("-12.180000");
  await page.getByRole("button", { name: "Appliquer les coordonnées" }).click();
  await page.getByRole("button", { name: "Continuer vers la connexion" }).click();

  await expect(page.getByRole("heading", { name: "Connexion ou création de compte" })).toBeVisible();
  expect(quoteBody).toMatchObject({
    destination: { region: "Kédougou", city: "Kédougou" },
    groups: [{ merchantId, deliveryZoneId: zoneId, methodKind: "merchant_delivery" }],
  });
});
