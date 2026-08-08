"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SENEGAL_REGIONS } from "@/lib/domain/merchant-ui";
import { formatPrice } from "@/lib/marketplace";

export type MerchantDeliveryZone = {
  id: string; label: string; region: string; city: string | null; fee_xof: number;
  min_delay_minutes: number; max_delay_minutes: number; active: boolean;
  delivery_methods: { kind: string } | Array<{ kind: string }>;
  delivery_category_rates: Array<{ category_id: string; fee_xof: number }>;
};

export function MerchantDeliverySettings({ merchantId, categories, zones, pickupSettingEnabled }: { merchantId: string; categories: Array<{ id: string; name: string }>; zones: MerchantDeliveryZone[]; pickupSettingEnabled?: boolean }) {
  const router = useRouter();
  const deliveryZones = zones.filter((zone) => { const method = Array.isArray(zone.delivery_methods) ? zone.delivery_methods[0] : zone.delivery_methods; return method?.kind === "merchant_delivery"; });
  const pickupEnabled = zones.some((zone) => { const method = Array.isArray(zone.delivery_methods) ? zone.delivery_methods[0] : zone.delivery_methods; return method?.kind === "pickup" && zone.active; });
  // Divergence possible sur des données antérieures à la synchronisation automatique
  // (onglet Boutique) : les deux mécanismes de retrait ne concordent plus.
  const pickupDiverged = pickupSettingEnabled !== undefined && pickupSettingEnabled !== pickupEnabled;
  const [region, setRegion] = useState("Dakar");
  const [feeXof, setFeeXof] = useState(1500);
  const [minDays, setMinDays] = useState(0);
  const [maxDays, setMaxDays] = useState(1);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");

  const loadZone = (zone: MerchantDeliveryZone) => {
    setRegion(zone.region); setFeeXof(zone.fee_xof); setMinDays(Math.floor(zone.min_delay_minutes / 1440)); setMaxDays(Math.ceil(zone.max_delay_minutes / 1440));
    setRates(Object.fromEntries((zone.delivery_category_rates ?? []).map((rate) => [rate.category_id, String(rate.fee_xof)])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/merchant/delivery-regions", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantId, region, enabled: true, feeXof, minDelayDays: minDays, maxDelayDays: maxDays, categoryRates: Object.entries(rates).filter(([, fee]) => fee !== "").map(([categoryId, fee]) => ({ categoryId, feeXof: Number(fee) })) }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Le tarif n’a pas pu être enregistré.");
    setMessage(`Tarifs de ${region} enregistrés.`); router.refresh();
  };
  const enablePickup = async () => {
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/delivery-zones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantId, methodKind: "pickup", methodName: "Retrait en boutique", region: "Retrait boutique", label: "Retrait en boutique", feeXof: 0, minDelayMinutes: 0, maxDelayMinutes: 1440 }) });
    const payload = await response.json(); setBusy(false); if (!response.ok) return setError(payload.error?.message ?? "Le retrait n’a pas pu être activé."); setMessage("Retrait en boutique activé."); router.refresh();
  };
  return <div className="merchant-delivery-space"><div className="merchant-section-heading"><div><span className="mvp-eyebrow">Livraison</span><h2>Où livrez-vous ?</h2><p>Un tarif de base par région, puis seulement les exceptions utiles par catégorie.</p></div></div>{message && <p className="mvp-alert">{message}</p>}{error && <p className="mvp-alert mvp-alert--error">{error}</p>}
    {pickupDiverged && <p className="mvp-alert mvp-alert--warning">Le retrait en boutique est {pickupSettingEnabled ? "activé" : "désactivé"} dans l’onglet « Ma boutique » mais {pickupEnabled ? "activé" : "désactivé"} ici. Ouvrez l’onglet « Ma boutique » et enregistrez à nouveau pour resynchroniser.</p>}
    <section className="delivery-pickup-card"><div><h3>Retrait en boutique</h3><p>Le client vient récupérer sa commande gratuitement chez vous.</p></div><button className="mvp-button mvp-button--secondary" disabled={pickupEnabled || busy} onClick={enablePickup}>{pickupEnabled ? "Activé" : "Activer le retrait"}</button></section>
    <form className="mvp-form delivery-region-form" onSubmit={save}><h3>Ajouter ou modifier une région</h3><div className="mvp-form__grid"><label className="mvp-field">Région<select value={region} onChange={(event) => setRegion(event.target.value)}>{SENEGAL_REGIONS.map((name) => <option value={name} key={name}>{name}</option>)}</select></label><label className="mvp-field">Tarif régional par défaut (FCFA)<input type="number" min="0" value={feeXof} onChange={(event) => setFeeXof(Number(event.target.value))} required /></label><label className="mvp-field">Livraison au plus tôt (jours)<input type="number" min="0" max="30" value={minDays} onChange={(event) => setMinDays(Number(event.target.value))} required /></label><label className="mvp-field">Livraison au plus tard (jours)<input type="number" min={minDays} max="30" value={maxDays} onChange={(event) => setMaxDays(Number(event.target.value))} required /></label></div><details className="delivery-category-overrides"><summary>Ajouter des tarifs particuliers par catégorie</summary><p>Une case vide conserve le tarif régional. Pour un panier mixte, SunuShop retient le tarif le plus élevé.</p><div className="mvp-form__grid">{categories.map((category) => <label className="mvp-field" key={category.id}>{category.name}<input type="number" min="0" placeholder={`${feeXof} par défaut`} value={rates[category.id] ?? ""} onChange={(event) => setRates((current) => ({ ...current, [category.id]: event.target.value }))} /></label>)}</div></details><button className="mvp-button" disabled={busy}>{busy ? "Enregistrement…" : `Enregistrer ${region}`}</button></form>
    <div className="delivery-region-grid">{deliveryZones.map((zone) => <article key={zone.id}><span className="mvp-eyebrow">Région desservie</span><h3>{zone.region}</h3><strong>{formatPrice(zone.fee_xof)}</strong><p>{Math.floor(zone.min_delay_minutes / 1440)} à {Math.ceil(zone.max_delay_minutes / 1440)} jour(s) · {zone.delivery_category_rates?.length ?? 0} exception(s)</p><button className="mvp-button mvp-button--secondary" onClick={() => loadZone(zone)}>Modifier les tarifs</button></article>)}</div>
  </div>;
}
