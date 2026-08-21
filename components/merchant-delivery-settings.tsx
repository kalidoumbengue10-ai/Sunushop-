"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SENEGAL_REGIONS } from "@/lib/domain/merchant-ui";
import { formatPrice } from "@/lib/marketplace";

export type MerchantDeliveryZone = {
  id: string; label: string; region: string; city: string | null; fee_xof: number; courier_fee_xof: number | null;
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
  const [editingZoneId, setEditingZoneId] = useState<string>();
  const [feeXof, setFeeXof] = useState(1500);
  const [courierFeeXof, setCourierFeeXof] = useState("1500");
  const [zoneEnabled, setZoneEnabled] = useState(true);
  const [minDelayDays, setMinDelayDays] = useState(0);
  const [maxDelayDays, setMaxDelayDays] = useState(0);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");

  const loadZone = (zone: MerchantDeliveryZone) => {
    setEditingZoneId(zone.id);
    setRegion(zone.region); setFeeXof(zone.fee_xof); setCourierFeeXof(zone.courier_fee_xof == null ? String(zone.fee_xof) : String(zone.courier_fee_xof));
    setZoneEnabled(zone.active); setMinDelayDays(Math.floor(zone.min_delay_minutes / 1440)); setMaxDelayDays(Math.ceil(zone.max_delay_minutes / 1440));
    setRates(Object.fromEntries((zone.delivery_category_rates ?? []).map((rate) => [rate.category_id, String(rate.fee_xof)])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/merchant/delivery-regions", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantId, zoneId: editingZoneId, region, enabled: zoneEnabled, feeXof, courierFeeXof: Number(courierFeeXof), minDelayDays, maxDelayDays, categoryRates: Object.entries(rates).filter(([, fee]) => fee !== "").map(([categoryId, fee]) => ({ categoryId, feeXof: Number(fee) })) }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Le tarif n’a pas pu être enregistré.");
    setMessage(`Tarifs de ${region} enregistrés.`); router.refresh();
  };
  const toggleZone = async (zone: MerchantDeliveryZone) => {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/merchant/delivery-regions", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
      merchantId, zoneId: zone.id, region: zone.region, enabled: !zone.active,
      feeXof: zone.fee_xof, courierFeeXof: zone.courier_fee_xof,
      minDelayDays: Math.floor(zone.min_delay_minutes / 1440), maxDelayDays: Math.ceil(zone.max_delay_minutes / 1440),
      categoryRates: (zone.delivery_category_rates ?? []).map((rate) => ({ categoryId: rate.category_id, feeXof: rate.fee_xof })),
    }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "La région n’a pas pu être modifiée.");
    setMessage(`${zone.region} ${zone.active ? "désactivée" : "activée"}.`); router.refresh();
  };
  const enablePickup = async () => {
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/delivery-zones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantId, methodKind: "pickup", methodName: "Retrait en boutique", region: "Retrait boutique", label: "Retrait en boutique", feeXof: 0, minDelayMinutes: 0, maxDelayMinutes: 1440 }) });
    const payload = await response.json(); setBusy(false); if (!response.ok) return setError(payload.error?.message ?? "Le retrait n’a pas pu être activé."); setMessage("Retrait en boutique activé."); router.refresh();
  };
  return <div className="merchant-delivery-space"><div className="merchant-section-heading"><div><span className="mvp-eyebrow">Livraison</span><h2>Où livrez-vous ?</h2><p>Un tarif de base par région, puis seulement les exceptions utiles par catégorie.</p></div></div>{message && <p className="mvp-alert" role="status">{message}</p>}{error && <p className="mvp-alert mvp-alert--error" role="alert">{error}</p>}
    {pickupDiverged && <p className="mvp-alert mvp-alert--warning">Le retrait en boutique est {pickupSettingEnabled ? "activé" : "désactivé"} dans l’onglet « Ma boutique » mais {pickupEnabled ? "activé" : "désactivé"} ici. Ouvrez l’onglet « Ma boutique » et enregistrez à nouveau pour resynchroniser.</p>}
    <section className="delivery-pickup-card"><div><h3>Retrait en boutique</h3><p>Le client vient récupérer sa commande gratuitement chez vous.</p></div><button className="mvp-button mvp-button--secondary" disabled={pickupEnabled || busy} onClick={enablePickup}>{pickupEnabled ? "Activé" : "Activer le retrait"}</button></section>
    <form className="mvp-form delivery-region-form" onSubmit={save}>
      <h3>Ajouter ou modifier une région</h3>
      <div className="mvp-form__grid">
        <label className="mvp-field">Région<select value={region} onChange={(event) => setRegion(event.target.value)}>{SENEGAL_REGIONS.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
        <label className="mvp-field">Prix facturé au client (FCFA)<input type="number" min="0" value={feeXof} onChange={(event) => setFeeXof(Number(event.target.value))} required /></label>
        <label className="mvp-field">Rémunération du livreur (FCFA)<input type="number" min="0" value={courierFeeXof} onChange={(event) => setCourierFeeXof(event.target.value)} required /><small>Ce montant sera figé pour chaque mission affectée dans cette zone.</small></label>
        <label className="mvp-field">Délai minimum (jours)<input type="number" min="0" max="30" value={minDelayDays} onChange={(event) => setMinDelayDays(Number(event.target.value))} required /></label>
        <label className="mvp-field">Délai maximum (jours)<input type="number" min={minDelayDays} max="30" value={maxDelayDays} onChange={(event) => setMaxDelayDays(Number(event.target.value))} required /></label>
        <label className="mvp-field mvp-field--checkbox"><input type="checkbox" checked={zoneEnabled} onChange={(event) => setZoneEnabled(event.target.checked)} />Région active et visible au checkout</label>
      </div>
      <details className="delivery-category-overrides"><summary>Ajouter des tarifs particuliers par catégorie</summary><p>Une case vide conserve le tarif régional. Pour un panier mixte, SunuShop retient le tarif le plus élevé.</p><div className="mvp-form__grid">{categories.map((category) => <label className="mvp-field" key={category.id}>{category.name}<input type="number" min="0" placeholder={`${feeXof} par défaut`} value={rates[category.id] ?? ""} onChange={(event) => setRates((current) => ({ ...current, [category.id]: event.target.value }))} /></label>)}</div></details>
      <button className="mvp-button" disabled={busy || maxDelayDays < minDelayDays}>{busy ? "Enregistrement…" : `Enregistrer ${region}`}</button>
    </form>
    <div className="delivery-region-grid">{deliveryZones.map((zone) => <article key={zone.id}><span className="mvp-eyebrow">{zone.active ? "Région desservie" : "Région désactivée"}</span><h3>{zone.region}</h3><strong>{formatPrice(zone.fee_xof)} client</strong><p>{zone.courier_fee_xof == null ? "Rémunération livreur à configurer" : `${formatPrice(zone.courier_fee_xof)} pour le livreur`} · {Math.floor(zone.min_delay_minutes / 1440)} à {Math.ceil(zone.max_delay_minutes / 1440)} jour(s)</p><div className="mvp-actions"><button className="mvp-button mvp-button--secondary" disabled={busy} onClick={() => loadZone(zone)}>Modifier</button><button className={zone.active ? "mvp-button mvp-button--danger" : "mvp-button"} disabled={busy} onClick={() => void toggleZone(zone)}>{zone.active ? "Désactiver" : "Réactiver"}</button></div></article>)}</div>
  </div>;
}
