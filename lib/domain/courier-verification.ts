export type CourierVehicleType = "walking" | "bicycle" | "motorbike" | "car" | "van" | "other";

export type CourierVerificationDocumentType =
  | "national_id_front"
  | "national_id_back"
  | "passport_identity"
  | "vehicle_registration_document";

export type CourierVerificationStatus =
  | "pending_verification"
  | "verified"
  | "rejected"
  | "suspended";

export const COURIER_VEHICLE_TYPES: CourierVehicleType[] = [
  "walking",
  "bicycle",
  "motorbike",
  "car",
  "van",
  "other",
];

const UNREGISTERED_VEHICLES = new Set<CourierVehicleType>(["walking", "bicycle"]);

export function vehicleRequiresRegistration(vehicleType: CourierVehicleType) {
  return !UNREGISTERED_VEHICLES.has(vehicleType);
}

export function requiredCourierVerificationDocuments(vehicleType: CourierVehicleType) {
  const required: CourierVerificationDocumentType[] = ["national_id_front", "national_id_back"];
  if (vehicleRequiresRegistration(vehicleType)) required.push("vehicle_registration_document");
  return { required, optional: ["passport_identity"] as CourierVerificationDocumentType[] };
}

export function isCourierVerificationChecklistComplete(
  vehicleType: CourierVehicleType,
  uploaded: Iterable<CourierVerificationDocumentType>,
) {
  const documents = new Set(uploaded);
  // Le passeport remplace la CNI recto/verso, comme pour le dossier commerçant.
  const identityOk =
    documents.has("passport_identity")
    || (documents.has("national_id_front") && documents.has("national_id_back"));
  if (!identityOk) return false;
  if (vehicleRequiresRegistration(vehicleType) && !documents.has("vehicle_registration_document")) {
    return false;
  }
  return true;
}

export const courierVehicleLabels: Record<CourierVehicleType, string> = {
  walking: "À pied",
  bicycle: "Vélo",
  motorbike: "Moto",
  car: "Voiture",
  van: "Fourgon",
  other: "Autre",
};

export const courierDocumentLabels: Record<CourierVerificationDocumentType, string> = {
  national_id_front: "Carte d’identité (recto)",
  national_id_back: "Carte d’identité (verso)",
  passport_identity: "Passeport",
  vehicle_registration_document: "Carte grise du véhicule",
};

export const courierVerificationStatusLabels: Record<CourierVerificationStatus, string> = {
  pending_verification: "Vérification en cours",
  verified: "Vérifié",
  rejected: "Dossier refusé",
  suspended: "Accès suspendu",
};
