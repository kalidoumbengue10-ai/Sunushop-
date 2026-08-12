import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type SubscriptionReceiptData = {
  issuedAt: string;
  merchantName: string;
  planName: string;
  billingCycleLabel: string;
  periodMonths: number;
  channelLabel: string;
  destinationNumber: string | null;
  externalReference: string;
  amountXof: number;
  paidAt: string;
  approvedAt: string | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatXof(value: number) {
  return `${new Intl.NumberFormat("fr-SN").format(value)} F`;
}

export async function renderSubscriptionReceiptPdf(data: SubscriptionReceiptData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ink = rgb(0.09, 0.15, 0.12);
  const brand = rgb(0.09, 0.25, 0.18);
  const muted = rgb(0.33, 0.39, 0.36);

  const drawText = (text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = options.size ?? 11;
    const usedFont = options.bold ? bold : font;
    const color = options.color ?? ink;
    page.drawText(text, { x: MARGIN, y, size, font: usedFont, color });
    y -= size + (options.gap ?? 4);
  };

  const drawRow = (left: string, right: string, options: { bold?: boolean; size?: number } = {}) => {
    const size = options.size ?? 11;
    const usedFont = options.bold ? bold : font;
    page.drawText(left, { x: MARGIN, y, size, font: usedFont, color: ink });
    const rightWidth = usedFont.widthOfTextAtSize(right, size);
    page.drawText(right, { x: MARGIN + CONTENT_WIDTH - rightWidth, y, size, font: usedFont, color: ink });
    y -= size + 4;
  };

  drawText("SUNUSHOP", { size: 10, bold: true, color: brand, gap: 2 });
  drawText("Reçu de paiement d’abonnement marchand", { size: 16, bold: true, gap: 2 });
  drawText(`Émis le ${data.issuedAt}`, { size: 10, color: muted, gap: 10 });

  drawRow("Boutique", data.merchantName, { bold: true });
  drawRow("Plan", data.planName);
  drawRow("Fréquence", `${data.billingCycleLabel} · ${data.periodMonths} mois`);
  y -= 6;

  drawText("Paiement", { size: 13, bold: true, gap: 4 });
  drawRow("Moyen de paiement", data.channelLabel);
  if (data.destinationNumber) drawRow("Numéro SunuShop crédité", data.destinationNumber);
  drawRow("Référence de transaction", data.externalReference);
  drawRow("Payé le", data.paidAt);
  if (data.approvedAt) drawRow("Confirmé par SunuShop le", data.approvedAt);
  y -= 6;

  drawRow("Montant payé", formatXof(data.amountXof), { bold: true, size: 13 });

  y -= 10;
  drawText(
    "Ce reçu atteste de la confirmation par SunuShop du paiement direct de l’abonnement marchand. Il ne constitue pas une facture fiscale.",
    { size: 9, color: muted },
  );

  return doc.save();
}
