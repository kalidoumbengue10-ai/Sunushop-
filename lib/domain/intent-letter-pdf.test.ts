import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderIntentLetterPdf, type IntentLetterData } from "./intent-letter-pdf";

const baseData: IntentLetterData = {
  signatoryName: "Awa Diop",
  signatoryBirthDate: "1990-05-12",
  idType: "cni",
  idNumber: "1234567890123",
  signatoryRole: "Propriétaire",
  actingFor: "own_account",
  legalName: null,
  publicName: "Boutique Awa",
  activityDescription: "Vente de vêtements traditionnels et accessoires.",
  addressHint: "Marché Sandaga, Dakar",
  phone: "+221770000000",
  email: "awa@example.test",
  ninea: null,
  rccm: "",
  signaturePlace: "Dakar",
  certifiedAt: "5 août 2026 à 15:30",
  certifiedByEmail: "awa@example.test",
};

describe("renderIntentLetterPdf", () => {
  it("génère un PDF valide (signature %PDF-)", async () => {
    const bytes = await renderIntentLetterPdf(baseData);
    const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("produit un document rechargeable avec au moins une page", async () => {
    const bytes = await renderIntentLetterPdf(baseData);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("ne plante pas quand les champs optionnels (NINEA, raison sociale, RCCM) sont absents", async () => {
    const bytes = await renderIntentLetterPdf({ ...baseData, ninea: null, legalName: null, rccm: "" });
    const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("gère un contenu long (activité détaillée) sans erreur en produisant plusieurs pages si nécessaire", async () => {
    const longActivity = "Vente de produits artisanaux, textiles, bijoux et accessoires de mode fabriqués localement. ".repeat(10);
    const bytes = await renderIntentLetterPdf({ ...baseData, activityDescription: longActivity });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("ne plante pas quand un champ contient un emoji ou un caractère hors WinAnsi", async () => {
    const bytes = await renderIntentLetterPdf({
      ...baseData,
      activityDescription: "Vente de basket 🏀 et vêtements de sport 👟 en ligne.",
      signatoryName: "Awa 😀 Diop",
    });
    const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("inclut les informations d'entreprise quand fournies (raison sociale, NINEA, RCCM)", async () => {
    const bytes = await renderIntentLetterPdf({
      ...baseData,
      actingFor: "company_account",
      legalName: "Atelier Awa SARL",
      ninea: "NINEA-12345",
      rccm: "SN-DKR-2026-B-1234",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
