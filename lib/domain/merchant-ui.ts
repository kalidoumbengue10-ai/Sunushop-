export const SENEGAL_REGIONS = [
  "Dakar",
  "Diourbel",
  "Fatick",
  "Kaffrine",
  "Kaolack",
  "Kédougou",
  "Kolda",
  "Louga",
  "Matam",
  "Saint-Louis",
  "Sédhiou",
  "Tambacounda",
  "Thiès",
  "Ziguinchor",
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  pending: "En attente",
  active: "Actif",
  grace: "Période de grâce",
  expired: "Expiré",
  approved: "Validé",
  rejected: "Refusé",
  needs_changes: "Modifications demandées",
  submitted: "Envoyé",
  published: "Publié",
  archived: "Archivé",
  pending_seller_confirmation: "À confirmer",
  confirmed: "Confirmée",
  preparing: "En préparation",
  ready_for_handoff: "Prête à remettre",
  in_transit: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
  disputed: "En litige",
  processing: "En cours",
  sent: "Envoyé",
  failed: "Échec",
};

export function merchantStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function formatMerchantOrderNumber(sequence: number | string) {
  return `CMD-${String(sequence).padStart(6, "0")}`;
}
