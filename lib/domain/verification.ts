export type MerchantKind = "informal" | "formal";
export type VerificationDocumentType =
  | "national_id_front"
  | "national_id_back"
  | "passport_identity"
  | "intent_letter"
  | "proof_activity"
  | "ninea"
  | "rccm"
  | "representative_mandate";

export function requiredVerificationDocuments(
  kind: MerchantKind,
  representativeIsLegalOwner: boolean,
) {
  const required: VerificationDocumentType[] = [
    "national_id_front",
    "national_id_back",
    "intent_letter",
    "proof_activity",
  ];

  if (kind === "formal") {
    required.push("ninea", "rccm");
    if (!representativeIsLegalOwner) required.push("representative_mandate");
  }

  return {
    required,
    optional: ["passport_identity"] satisfies VerificationDocumentType[],
  };
}

export function isVerificationChecklistComplete(
  kind: MerchantKind,
  representativeIsLegalOwner: boolean,
  uploaded: Iterable<VerificationDocumentType>,
) {
  const documents = new Set(uploaded);
  const checklist = requiredVerificationDocuments(
    kind,
    representativeIsLegalOwner,
  );

  return checklist.required.every((document) => documents.has(document));
}
