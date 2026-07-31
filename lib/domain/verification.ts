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
  const common: VerificationDocumentType[] = [
    "intent_letter",
    "proof_activity",
  ];

  if (kind === "formal") {
    common.push("ninea", "rccm");
    if (!representativeIsLegalOwner) common.push("representative_mandate");
  }

  return {
    required: common,
    identityAlternatives: [
      ["passport_identity"],
      ["national_id_front", "national_id_back"],
    ] satisfies VerificationDocumentType[][],
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

  return (
    checklist.required.every((document) => documents.has(document)) &&
    checklist.identityAlternatives.some((alternative) =>
      alternative.every((document) => documents.has(document)),
    )
  );
}
