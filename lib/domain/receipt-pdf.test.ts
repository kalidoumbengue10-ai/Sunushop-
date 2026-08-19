import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import {
  renderOrderReceiptPdf,
  resolveOrderReceiptBuyerName,
  type OrderReceiptData,
} from "./receipt-pdf";

const baseData: OrderReceiptData = {
  publicCode: "SUNU-ÉTÉ-2026",
  merchantOrderNumber: "CMD-000042",
  issuedAt: "19 août 2026 à 18:30",
  paymentMethodLabel: "Orange Money",
  paymentReference: "OM-KÉDOUGOU-123456",
  paidAt: "19 août 2026 à 18:20",
  buyerName: "Awa N’Diaye",
  merchantName: "Atelier Ñuul — Créations sénégalaises",
  merchantPhone: "+221 77 000 00 00",
  items: [{
    title: "Grand panier tressé édition été à anses renforcées",
    quantity: 2,
    unitPriceXof: 5_000,
    lineTotalXof: 10_000,
  }],
  subtotalXof: 10_000,
  deliveryFeeXof: 1_500,
  loyaltyDiscountXof: 500,
  totalXof: 11_000,
};

async function extractPdfText(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: bytes });
  const document = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" "));
    }
    return pages.join(" ").replace(/\s+/gu, " ").trim();
  } finally {
    await loadingTask.destroy();
  }
}

describe("reçu PDF de commande", () => {
  it("génère un PDF valide avec une police Unicode incorporée", async () => {
    const bytes = await renderOrderReceiptPdf(baseData);
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  it("conserve les accents et toutes les informations de preuve", async () => {
    const text = await extractPdfText(await renderOrderReceiptPdf(baseData));
    expect(text).toContain("Reçu de paiement de commande");
    expect(text).toContain("Awa N’Diaye");
    expect(text).toContain("Atelier Ñuul — Créations sénégalaises");
    expect(text).toContain("OM-KÉDOUGOU-123456");
    expect(text).toContain("Grand panier tressé édition été à anses renforcées");
    expect(text).toContain("Frais de livraison");
    expect(text).toContain("Total payé");
    expect(text).toContain("11 000 F");
  });

  it("gère les noms et références très longs sans perdre le contenu", async () => {
    const longReference = `WAVE-${"1234567890".repeat(8)}`;
    const bytes = await renderOrderReceiptPdf({
      ...baseData,
      merchantName: "Coopérative artisanale des créatrices et créateurs de la région de Kédougou",
      paymentReference: longReference,
      items: [{ ...baseData.items[0], title: "Produit traditionnel avec un intitulé volontairement très long pour vérifier le retour automatique à la ligne" }],
    });
    const text = await extractPdfText(bytes);
    expect(text).toContain("Coopérative artisanale des créatrices et créateurs");
    expect(text).toContain("Produit traditionnel avec un intitulé volontairement très long");
    expect(text.replaceAll(" ", "")).toContain(longReference);
  });

  it("préfère le destinataire quand le nom du profil client est vide", () => {
    expect(resolveOrderReceiptBuyerName("Client commande d’hier", "")).toBe("Client commande d’hier");
    expect(resolveOrderReceiptBuyerName("", "Awa Profil")).toBe("Awa Profil");
    expect(resolveOrderReceiptBuyerName(null, "   ")).toBe("Client SunuShop");
  });
});
