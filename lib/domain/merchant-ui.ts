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

export type MerchantWorkspaceRole = "owner" | "manager" | "catalog" | "fulfillment";

export const MERCHANT_WORKSPACE_TABS = [
  "dashboard",
  "commandes",
  "catalogue",
  "livraison",
  "livreurs",
  "messages",
  "boutique",
  "abonnement",
  "dossier",
] as const;

export type MerchantWorkspaceTab = (typeof MERCHANT_WORKSPACE_TABS)[number];

const ROLE_TABS: Record<MerchantWorkspaceRole, readonly MerchantWorkspaceTab[]> = {
  owner: MERCHANT_WORKSPACE_TABS,
  manager: MERCHANT_WORKSPACE_TABS,
  catalog: ["catalogue", "boutique"],
  fulfillment: ["commandes", "livraison", "livreurs"],
};

/**
 * Mirrors the roles accepted by the merchant APIs. Keeping this mapping in a
 * domain module makes it harder for the UI to advertise an action which will
 * immediately fail with a 403.
 */
export function merchantTabsForRole(role: MerchantWorkspaceRole) {
  return ROLE_TABS[role];
}

export function merchantCanAccessTab(
  role: MerchantWorkspaceRole,
  tab: MerchantWorkspaceTab,
) {
  return ROLE_TABS[role].includes(tab);
}

export function defaultMerchantTab(
  role: MerchantWorkspaceRole,
  subscriptionReady: boolean,
): MerchantWorkspaceTab {
  if (!subscriptionReady && merchantCanAccessTab(role, "abonnement")) {
    return "abonnement";
  }
  return ROLE_TABS[role][0];
}
