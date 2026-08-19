import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type RGB } from "pdf-lib";

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
const FONT_DIRECTORY = join(process.cwd(), "public", "fonts");

let receiptFontsPromise: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;

function loadReceiptFonts() {
  receiptFontsPromise ??= Promise.all([
    readFile(join(FONT_DIRECTORY, "NotoSans-Regular.ttf")),
    readFile(join(FONT_DIRECTORY, "NotoSans-Bold.ttf")),
  ]).then(([regular, bold]) => ({ regular: new Uint8Array(regular), bold: new Uint8Array(bold) }));
  return receiptFontsPromise;
}

function cleanPdfText(value: string) {
  return value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/gu, "").replace(/\s+/gu, " ").trim();
}

export function resolveOrderReceiptBuyerName(recipientName: unknown, profileDisplayName: unknown) {
  const snapshotName = typeof recipientName === "string" ? cleanPdfText(recipientName) : "";
  const profileName = typeof profileDisplayName === "string" ? cleanPdfText(profileDisplayName) : "";
  return snapshotName || profileName || "Client SunuShop";
}

function formatXof(value: number) {
  return `${new Intl.NumberFormat("fr-SN").format(value)} F`;
}

function splitLongToken(token: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const chunks: string[] = [];
  let current = "";
  for (const character of token) {
    const candidate = `${current}${character}`;
    if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapText(rawText: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const text = cleanPdfText(rawText);
  if (!text) return [""];
  const tokens = text.split(" ").flatMap((token) =>
    font.widthOfTextAtSize(token, fontSize) > maxWidth
      ? splitLongToken(token, font, fontSize, maxWidth)
      : [token],
  );
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderOrderReceiptPdf(rawData: OrderReceiptData): Promise<Uint8Array> {
  const data: OrderReceiptData = {
    ...rawData,
    publicCode: cleanPdfText(rawData.publicCode),
    merchantOrderNumber: rawData.merchantOrderNumber ? cleanPdfText(rawData.merchantOrderNumber) : null,
    issuedAt: cleanPdfText(rawData.issuedAt),
    paymentMethodLabel: cleanPdfText(rawData.paymentMethodLabel),
    paymentReference: rawData.paymentReference ? cleanPdfText(rawData.paymentReference) : null,
    paidAt: rawData.paidAt ? cleanPdfText(rawData.paidAt) : null,
    buyerName: resolveOrderReceiptBuyerName(rawData.buyerName, null),
    merchantName: cleanPdfText(rawData.merchantName) || "Boutique SunuShop",
    merchantPhone: rawData.merchantPhone ? cleanPdfText(rawData.merchantPhone) : null,
    items: rawData.items.map((item) => ({ ...item, title: cleanPdfText(item.title) || "Article" })),
  };

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const receiptFonts = await loadReceiptFonts();
  const font = await doc.embedFont(receiptFonts.regular, { subset: true });
  const bold = await doc.embedFont(receiptFonts.bold, { subset: true });
  doc.setTitle(`Reçu de paiement ${data.publicCode}`);
  doc.setAuthor("SunuShop");
  doc.setSubject("Reçu de paiement de commande");
  doc.setCreator("SunuShop");

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

  const drawText = (text: string, options: { size?: number; bold?: boolean; color?: RGB; gap?: number } = {}) => {
    const size = options.size ?? 11;
    const usedFont = options.bold ? bold : font;
    const lines = wrapText(text, usedFont, size, CONTENT_WIDTH);
    const lineHeight = size + 4;
    ensureSpace(lines.length * lineHeight + (options.gap ?? 4));
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size, font: usedFont, color: options.color ?? ink });
      y -= lineHeight;
    }
    y -= options.gap ?? 4;
  };

  const drawColumns = (
    left: string,
    right: string,
    options: { bold?: boolean; size?: number; leftWidth?: number; gap?: number } = {},
  ) => {
    const size = options.size ?? 11;
    const usedFont = options.bold ? bold : font;
    const columnGap = 18;
    const leftWidth = options.leftWidth ?? 145;
    const rightWidth = CONTENT_WIDTH - leftWidth - columnGap;
    const leftLines = wrapText(left, usedFont, size, leftWidth);
    const rightLines = wrapText(right, usedFont, size, rightWidth);
    const lineHeight = size + 4;
    const rowHeight = Math.max(leftLines.length, rightLines.length) * lineHeight + (options.gap ?? 2);
    ensureSpace(rowHeight);
    leftLines.forEach((line, index) => {
      page.drawText(line, { x: MARGIN, y: y - index * lineHeight, size, font: usedFont, color: ink });
    });
    rightLines.forEach((line, index) => {
      page.drawText(line, { x: MARGIN + leftWidth + columnGap, y: y - index * lineHeight, size, font: usedFont, color: ink });
    });
    y -= rowHeight;
  };

  drawText("SUNUSHOP", { size: 10, bold: true, color: brand, gap: 2 });
  drawText("Reçu de paiement de commande", { size: 16, bold: true, gap: 2 });
  drawText(`Émis le ${data.issuedAt}`, { size: 10, color: muted, gap: 10 });

  drawColumns("Commande", data.merchantOrderNumber ?? data.publicCode, { bold: true });
  drawColumns("Code de suivi", data.publicCode);
  drawColumns("Client", data.buyerName);
  drawColumns("Boutique", data.merchantName);
  if (data.merchantPhone) drawColumns("Contact boutique", data.merchantPhone);
  y -= 6;

  drawText("Paiement", { size: 13, bold: true, gap: 4 });
  drawColumns("Moyen de paiement", data.paymentMethodLabel);
  if (data.paymentReference) drawColumns("Référence de transaction", data.paymentReference);
  if (data.paidAt) drawColumns("Payé le", data.paidAt);
  y -= 6;

  drawText("Détail de la commande", { size: 13, bold: true, gap: 4 });
  drawColumns("Article", "Qté · Prix unitaire · Total", { bold: true, size: 10, leftWidth: 245 });
  y -= 2;
  for (const item of data.items) {
    drawColumns(
      item.title,
      `${item.quantity} × ${formatXof(item.unitPriceXof)} = ${formatXof(item.lineTotalXof)}`,
      { size: 10, leftWidth: 245, gap: 4 },
    );
  }
  y -= 6;

  drawColumns("Sous-total", formatXof(data.subtotalXof));
  drawColumns("Frais de livraison", formatXof(data.deliveryFeeXof));
  if (data.loyaltyDiscountXof > 0) drawColumns("Remise fidélité", `- ${formatXof(data.loyaltyDiscountXof)}`);
  drawColumns("Total payé", formatXof(data.totalXof), { bold: true, size: 13, gap: 6 });

  y -= 8;
  drawText(
    "Ce reçu atteste de la confirmation du paiement direct entre le client et la boutique sur SunuShop. Il ne constitue pas une facture fiscale.",
    { size: 9, color: muted },
  );

  return doc.save();
}
