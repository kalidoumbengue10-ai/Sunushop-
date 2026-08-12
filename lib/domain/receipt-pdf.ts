import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type OrderReceiptData = {
  publicCode: string;
  merchantOrderNumber: string | null;
  issuedAt: string;
  paymentMethodLabel: string;
  paymentReference: string | null;
  paidAt: string | null;
  buyerName: string;
  merchantName: string;
  merchantPhone: string | null;
  items: Array<{ title: string; quantity: number; unitPriceXof: number; lineTotalXof: number }>;
  subtotalXof: number;
  deliveryFeeXof: number;
  loyaltyDiscountXof: number;
  totalXof: number;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatXof(value: number) {
  return `${new Intl.NumberFormat("fr-SN").format(value)} F`;
}

function wrapText(text: string, font: import("pdf-lib").PDFFont, fontSize: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderOrderReceiptPdf(data: OrderReceiptData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ink = rgb(0.09, 0.15, 0.12);
  const brand = rgb(0.09, 0.25, 0.18);
  const muted = rgb(0.33, 0.39, 0.36);

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawText = (text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number } = {}) => {
    const size = options.size ?? 11;
    const usedFont = options.bold ? bold : font;
    const color = options.color ?? ink;
    const lines = wrapText(text, usedFont, size, CONTENT_WIDTH - (options.x ?? 0));
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN + (options.x ?? 0), y, size, font: usedFont, color });
      y -= size + 4;
    }
    y -= options.gap ?? 4;
  };

  const drawRow = (left: string, right: string, options: { bold?: boolean; size?: number } = {}) => {
    const size = options.size ?? 11;
    const usedFont = options.bold ? bold : font;
    ensureSpace(size + 4);
    page.drawText(left, { x: MARGIN, y, size, font: usedFont, color: ink });
    const rightWidth = usedFont.widthOfTextAtSize(right, size);
    page.drawText(right, { x: MARGIN + CONTENT_WIDTH - rightWidth, y, size, font: usedFont, color: ink });
    y -= size + 4;
  };

  drawText("SUNUSHOP", { size: 10, bold: true, color: brand, gap: 2 });
  drawText("Reçu de paiement de commande", { size: 16, bold: true, gap: 2 });
  drawText(`Émis le ${data.issuedAt}`, { size: 10, color: muted, gap: 10 });

  drawRow("Commande", data.merchantOrderNumber ?? data.publicCode, { bold: true });
  drawRow("Code de suivi", data.publicCode);
  drawRow("Client", data.buyerName);
  drawRow("Boutique", data.merchantName);
  if (data.merchantPhone) drawRow("Contact boutique", data.merchantPhone);
  y -= 6;

  drawText("Paiement", { size: 13, bold: true, gap: 4 });
  drawRow("Moyen de paiement", data.paymentMethodLabel);
  if (data.paymentReference) drawRow("Référence de transaction", data.paymentReference);
  if (data.paidAt) drawRow("Payé le", data.paidAt);
  y -= 6;

  drawText("Détail de la commande", { size: 13, bold: true, gap: 4 });
  drawRow("Article", "Qté · Prix unitaire · Total", { bold: true, size: 10 });
  y -= 2;
  for (const item of data.items) {
    drawRow(item.title, `${item.quantity} × ${formatXof(item.unitPriceXof)} = ${formatXof(item.lineTotalXof)}`, { size: 10 });
  }
  y -= 6;

  drawRow("Sous-total", formatXof(data.subtotalXof));
  drawRow("Frais de livraison", formatXof(data.deliveryFeeXof));
  if (data.loyaltyDiscountXof > 0) drawRow("Remise fidélité", `- ${formatXof(data.loyaltyDiscountXof)}`);
  drawRow("Total payé", formatXof(data.totalXof), { bold: true, size: 13 });

  y -= 10;
  drawText(
    "Ce reçu atteste de la confirmation du paiement direct entre le client et la boutique sur SunuShop. Il ne constitue pas une facture fiscale.",
    { size: 9, color: muted },
  );

  return doc.save();
}
