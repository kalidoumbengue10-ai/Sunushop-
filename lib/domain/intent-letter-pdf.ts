import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const WIN_ANSI_SAFE = /[^ -ÿ–—‘’“”…]/gu;

function sanitizeForPdf(value: string): string {
  return value.replace(WIN_ANSI_SAFE, "").replace(/\s+/g, " ").trim();
}

export type IntentLetterData = {
  signatoryName: string;
  signatoryBirthDate: string;
  idType: "cni" | "passeport";
  idNumber: string;
  signatoryRole: string;
  actingFor: "own_account" | "company_account";
  legalName: string | null;
  publicName: string;
  activityDescription: string;
  addressHint: string;
  phone: string;
  email: string;
  ninea: string | null;
  rccm: string;
  signaturePlace: string;
  certifiedAt: string;
  certifiedByEmail: string;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COMMITMENTS = [
  "fournir des informations et des justificatifs exacts, lisibles, valides et à jour, et signaler sans délai toute modification importante concernant mon identité, mon entreprise, mon activité ou mes coordonnées ;",
  "proposer uniquement des produits licites, authentiques, traçables et dont je suis autorisé(e) à assurer la vente, en excluant notamment les produits interdits, contrefaits, dangereux ou présentés de manière trompeuse ;",
  "obtenir et maintenir, lorsque mon activité l’exige, les autorisations, agréments, licences, garanties ou justificatifs sectoriels nécessaires ;",
  "publier des descriptions et photos fidèles, ainsi que des prix, stocks, conditions de vente, zones de remise ou de livraison et délais exacts ;",
  "confirmer, préparer et remettre les commandes avec diligence, informer le client en cas d’indisponibilité ou de retard et traiter de bonne foi les annulations, retours, réclamations et litiges ;",
  "respecter les règles applicables de SunuShop ainsi que les obligations légales, fiscales, commerciales et de protection du consommateur liées à mon activité.",
];

const ACKNOWLEDGEMENT =
  "Je reconnais que cette lettre exprime mon intention de rejoindre SunuShop et ne vaut pas, à elle seule, validation définitive de ma boutique. J’autorise SunuShop à vérifier la cohérence des éléments transmis et à demander des pièces complémentaires. Je comprends qu’un dossier incomplet ou incohérent, un produit interdit ou un manquement aux règles peut entraîner une demande de correction, un refus, une suspension ou la fermeture de la boutique, dans les conditions applicables au service.";

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

export async function renderIntentLetterPdf(rawData: IntentLetterData): Promise<Uint8Array> {
  const data: IntentLetterData = {
    ...rawData,
    signatoryName: sanitizeForPdf(rawData.signatoryName),
    idNumber: sanitizeForPdf(rawData.idNumber),
    signatoryRole: sanitizeForPdf(rawData.signatoryRole),
    legalName: rawData.legalName ? sanitizeForPdf(rawData.legalName) : rawData.legalName,
    publicName: sanitizeForPdf(rawData.publicName),
    activityDescription: sanitizeForPdf(rawData.activityDescription),
    addressHint: sanitizeForPdf(rawData.addressHint),
    phone: sanitizeForPdf(rawData.phone),
    email: sanitizeForPdf(rawData.email),
    ninea: rawData.ninea ? sanitizeForPdf(rawData.ninea) : rawData.ninea,
    rccm: sanitizeForPdf(rawData.rccm),
    signaturePlace: sanitizeForPdf(rawData.signaturePlace),
    certifiedByEmail: sanitizeForPdf(rawData.certifiedByEmail),
  };

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

  const drawText = (text: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = options.size ?? 11;
    const usedFont = options.bold ? bold : font;
    const color = options.color ?? ink;
    const lines = wrapText(text, usedFont, size, CONTENT_WIDTH);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN, y, size, font: usedFont, color });
      y -= size + 4;
    }
    y -= options.gap ?? 4;
  };

  drawText("SUNUSHOP", { size: 10, bold: true, color: brand, gap: 2 });
  drawText("Lettre d’intention et déclaration d’engagement du commerçant", { size: 16, bold: true, gap: 2 });
  drawText("Générée en ligne à l’attention de l’équipe chargée de la vérification des marchands SunuShop", { size: 10, color: muted, gap: 10 });

  const idLabel = data.idType === "cni" ? "CNI" : "passeport";
  const actingLabel = data.actingFor === "own_account" ? "pour mon propre compte" : "pour le compte de l’entreprise";

  drawText(
    `Je soussigné(e), ${data.signatoryName}, né(e) le ${data.signatoryBirthDate}, titulaire ${data.idType === "cni" ? "de la" : "du"} ${idLabel} numéro ${data.idNumber},`,
  );
  drawText(`agissant en qualité de ${data.signatoryRole}, ${actingLabel},`);
  if (data.legalName) drawText(`raison sociale, le cas échéant : ${data.legalName}`);
  if (data.ninea) drawText(`NINEA : ${data.ninea}${data.rccm ? `    RCCM : ${data.rccm}` : ""}`);
  else if (data.rccm) drawText(`RCCM : ${data.rccm}`);

  drawText("Objet de la demande", { size: 13, bold: true, gap: 4 });
  drawText(`Par la présente, je confirme mon intention d’ouvrir et d’exploiter une boutique marchande sur SunuShop sous le nom public : ${data.publicName}`);
  drawText(`Activité principale et catégories de produits proposées : ${data.activityDescription}`);
  drawText(`Adresse ou zone d’activité : ${data.addressHint}`);
  drawText(`Téléphone professionnel : ${data.phone}    E-mail : ${data.email}`);

  drawText("Déclarations et engagements", { size: 13, bold: true, gap: 4 });
  drawText("Je déclare et m’engage à :", { gap: 4 });
  COMMITMENTS.forEach((commitment, index) => {
    drawText(`${index + 1}. ${commitment}`, { gap: 3 });
  });

  drawText(ACKNOWLEDGEMENT, { gap: 8 });
  drawText("Je certifie sur l’honneur l’exactitude des déclarations ci-dessus.", { bold: true, gap: 10 });

  drawText(`Fait à : ${data.signaturePlace}`, { gap: 2 });
  drawText(
    `Certifié en ligne le ${data.certifiedAt} par ${data.certifiedByEmail}, en lieu et place d’une signature manuscrite.`,
    { bold: true, color: brand },
  );

  return doc.save();
}
