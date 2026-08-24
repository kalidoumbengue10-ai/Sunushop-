"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/marketplace";
import { getBrowserSupabase } from "@/lib/infrastructure/supabase/browser";
import { SENEGAL_REGIONS } from "@/lib/domain/merchant-ui";
import { AbandonedCarts } from "@/components/abandoned-carts";
import { LocationPicker } from "@/components/location-map";
import type { Coordinates } from "@/lib/domain/geo";
import { SenegalPhoneInput } from "@/components/senegal-phone-input";
import { ShopCard, type ShopCardData } from "@/components/shop-card";
import { useShopRelationships } from "@/components/favorites-provider";

type Address = { id: string; label: string; recipient_name: string; phone: string; region: string; city: string; address_hint: string; latitude: number | null; longitude: number | null; is_default: boolean };
type Order = { id: string; public_code: string; status: string; total_xof: number; created_at: string; merchant_accounts: { public_name: string } | Array<{ public_name: string }> };
type ShopRelation = { relationId: string; merchantId: string; createdAt: string; shop: ShopCardData & { region: string | null } };

const ORDER_TABS = ["en_cours", "terminees", "annulees"] as const;
type OrderTab = (typeof ORDER_TABS)[number];
const ORDER_TAB_LABELS: Record<OrderTab, string> = { en_cours: "En cours", terminees: "Terminées", annulees: "Annulées" };
const CANCELLED_STATUSES = new Set(["cancelled", "disputed"]);
const FINISHED_STATUSES = new Set(["delivered"]);

function orderTab(status: string): OrderTab {
  if (CANCELLED_STATUSES.has(status)) return "annulees";
  if (FINISHED_STATUSES.has(status)) return "terminees";
  return "en_cours";
}

export function ClientWorkspace() {
  const { toggleFollow, toggleFavorite } = useShopRelationships();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [shopFollows, setShopFollows] = useState<ShopRelation[]>([]);
  const [shopFavorites, setShopFavorites] = useState<ShopRelation[]>([]);
  const [activeTab, setActiveTab] = useState<OrderTab>("en_cours");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [addressCoordinates, setAddressCoordinates] = useState<Coordinates | null>(null);
  const [addressPhone, setAddressPhone] = useState("+221");
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const load = useCallback(async () => {
    const [addressResponse, orderResponse, shopFollowResponse, shopFavoriteResponse] = await Promise.all([
      fetch("/api/client/addresses"),
      fetch("/api/client/orders"),
      fetch("/api/client/shop-follows"),
      fetch("/api/client/shop-favorites"),
    ]);
    const [addressPayload, orderPayload, shopFollowPayload, shopFavoritePayload] = await Promise.all([
      addressResponse.json(),
      orderResponse.json(),
      shopFollowResponse.json(),
      shopFavoriteResponse.json(),
    ]);
    if (!addressResponse.ok) throw new Error(addressPayload.error?.message);
    if (!orderResponse.ok) throw new Error(orderPayload.error?.message);
    if (!shopFollowResponse.ok) throw new Error(shopFollowPayload.error?.message);
    if (!shopFavoriteResponse.ok) throw new Error(shopFavoritePayload.error?.message);
    setAddresses(addressPayload.data.items); setOrders(orderPayload.data.items); setShopFollows(shopFollowPayload.data.items); setShopFavorites(shopFavoritePayload.data.items);
  }, []);
  useEffect(() => {
    // Chargement réseau initial, puis abonnement aux mises à jour.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((caught: Error) => setError(caught.message));
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") load().catch(() => undefined); }, 30_000);
    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]> | undefined;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        // Filtré sur l'acheteur : sans ce filtre, chaque changement de commande
        // (toutes boutiques et tous acheteurs confondus) réveillait tous les clients connectés.
        channel = supabase.channel("client-orders")
          .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `buyer_id=eq.${user.id}` }, () => { load().catch(() => undefined); })
          .subscribe();
      } catch { /* Le rafraîchissement périodique reste actif. */ }
    })();
    return () => { cancelled = true; window.clearInterval(interval); if (channel) channel.unsubscribe(); };
  }, [load]);
  const saveAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!addressCoordinates) return setError("Placez cette adresse sur la carte.");
    setAddressBusy(true);
    try {
      const response = await fetch("/api/client/addresses", { method: editingAddress ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        ...(editingAddress ? { id: editingAddress.id } : {}), label: form.get("label"), recipientName: form.get("recipientName"), phone: addressPhone, region: form.get("region"), city: form.get("city"), addressHint: form.get("addressHint"), latitude: addressCoordinates.latitude, longitude: addressCoordinates.longitude, isDefault: form.get("isDefault") === "on",
      }) });
      const payload = await response.json(); if (!response.ok) return setError(payload.error?.message ?? "Adresse non enregistrée.");
      setMessage(editingAddress ? "Adresse mise à jour." : "Adresse enregistrée."); formElement.reset(); setAddressPhone("+221"); setAddressCoordinates(null); setEditingAddress(null); await load();
    } catch { setError("Impossible de joindre SunuShop pour enregistrer cette adresse."); }
    finally { setAddressBusy(false); }
  };
  const editAddress = (address: Address) => {
    setEditingAddress(address); setAddressPhone(address.phone); setError(""); setMessage("");
    setAddressCoordinates(address.latitude != null && address.longitude != null ? { latitude: address.latitude, longitude: address.longitude } : null);
  };
  const setDefaultAddress = async (address: Address) => {
    setAddressBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/client/addresses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        id: address.id, label: address.label, recipientName: address.recipient_name, phone: address.phone, region: address.region, city: address.city, addressHint: address.address_hint, latitude: address.latitude, longitude: address.longitude, isDefault: true,
      }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setError(payload?.error?.message ?? "Adresse par défaut non enregistrée.");
      setMessage("Adresse par défaut mise à jour."); await load();
    } catch { setError("Impossible de joindre SunuShop pour modifier cette adresse."); }
    finally { setAddressBusy(false); }
  };
  const archive = async (id: string) => {
    if (!window.confirm("Archiver cette adresse ? Elle ne sera plus proposée lors de la commande.")) return;
    setAddressBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/client/addresses", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, archive: true }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setError(payload?.error?.message ?? "Adresse non archivée."); setMessage("Adresse archivée."); await load();
    } catch { setError("Impossible de joindre SunuShop pour archiver cette adresse."); }
    finally { setAddressBusy(false); }
  };
  const removeRelationship = async (kind: "follow" | "favorite", merchantId: string) => {
    setError("");
    try {
      await (kind === "follow" ? toggleFollow(merchantId) : toggleFavorite(merchantId));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La boutique n’a pas pu être retirée.");
    }
  };
  const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;
  return <div className="mvp-grid">
    <section className="mvp-card mvp-card--full"><span className="mvp-eyebrow">Espace client</span><h1 className="mvp-title">Achats, adresses et suivi</h1><div className="mvp-actions"><Link className="mvp-button" href="/marche">Ouvrir mon panier</Link></div>{message && <p className="mvp-alert">{message}</p>}{error && <p className="mvp-alert mvp-alert--error">{error}</p>}</section>
    <AbandonedCarts />
    <section className="mvp-card"><h2>Mes adresses</h2><div className="mvp-list">{addresses.map((address) => <div className="mvp-row" key={address.id}><div><strong>{address.label}{address.is_default ? " · par défaut" : ""}</strong><small>{address.recipient_name} · {address.phone}<br />{address.city}, {address.address_hint}<br />{address.latitude == null ? "À localiser avant une livraison" : "Position enregistrée"}</small></div><div className="mvp-actions"><button type="button" className="mvp-button mvp-button--secondary" disabled={addressBusy} onClick={() => editAddress(address)}>Modifier</button>{!address.is_default && <button type="button" className="mvp-button mvp-button--secondary" disabled={addressBusy || address.latitude == null || address.longitude == null} onClick={() => void setDefaultAddress(address)}>Définir par défaut</button>}<button type="button" className="mvp-button mvp-button--secondary" disabled={addressBusy} onClick={() => void archive(address.id)}>Archiver</button></div></div>)}</div>
      <form className="mvp-form" onSubmit={saveAddress} key={editingAddress?.id ?? "new-address"}><h3>{editingAddress ? "Modifier l’adresse" : "Ajouter une adresse"}</h3><div className="mvp-form__grid"><label className="mvp-field">Libellé<input name="label" placeholder="Maison" defaultValue={editingAddress?.label} required /></label><label className="mvp-field">Destinataire<input name="recipientName" defaultValue={editingAddress?.recipient_name} required /></label><label className="mvp-field">Téléphone<SenegalPhoneInput value={addressPhone} onChange={setAddressPhone} required /></label><label className="mvp-field">Région<select name="region" required defaultValue={editingAddress?.region ?? ""}><option value="" disabled>Choisissez une région</option>{SENEGAL_REGIONS.map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label className="mvp-field">Ville<input name="city" defaultValue={editingAddress?.city} required /></label></div><label className="mvp-field">Adresse et repère<textarea name="addressHint" defaultValue={editingAddress?.address_hint} required /></label><LocationPicker value={addressCoordinates} onChange={setAddressCoordinates} label="Position de livraison" required /><label><input name="isDefault" type="checkbox" defaultChecked={editingAddress?.is_default} /> Adresse par défaut</label><div className="mvp-actions"><button className="mvp-button" disabled={addressBusy}>{addressBusy ? "Enregistrement…" : editingAddress ? "Mettre à jour" : "Enregistrer"}</button>{editingAddress && <button type="button" className="mvp-button mvp-button--secondary" disabled={addressBusy} onClick={() => { setEditingAddress(null); setAddressPhone("+221"); setAddressCoordinates(null); }}>Annuler la modification</button>}</div></form>
    </section>
    <section className="mvp-card"><h2>Mes commandes</h2><Link className="mvp-link" href="/client/commandes">Voir toutes mes commandes en détail →</Link>
      <div className="mvp-tabs" role="tablist" aria-label="Filtrer mes commandes">
        {ORDER_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "mvp-tab is-active" : "mvp-tab"}
            onClick={() => setActiveTab(tab)}
          >
            {ORDER_TAB_LABELS[tab]} ({orders.filter((order) => orderTab(order.status) === tab).length})
          </button>
        ))}
      </div>
      <div className="mvp-list">{orders.filter((order) => orderTab(order.status) === activeTab).map((order) => <div className="mvp-row" key={order.id}><div><Link href={`/commandes/${order.id}`}><strong>{order.public_code}</strong></Link><small>{one(order.merchant_accounts)?.public_name} · {formatPrice(order.total_xof)} · {new Date(order.created_at).toLocaleDateString("fr-SN")}</small></div><span className="mvp-status" data-status={order.status}>{order.status.replaceAll("_", " ")}</span></div>)}</div>
      {!orders.filter((order) => orderTab(order.status) === activeTab).length && <p className="mvp-empty">Aucune commande dans cette catégorie.</p>}
    </section>
    <section className="mvp-card mvp-card--full"><h2>Mes favoris</h2><p>Vos boutiques enregistrées, sans notification.</p><div className="shop-directory-grid">{shopFavorites.map((relation) => <ShopCard shop={relation.shop} key={relation.relationId} />)}</div>{!shopFavorites.length && <p className="mvp-empty">Vous n’avez aucune boutique favorite pour le moment.</p>}<div className="mvp-actions">{shopFavorites.map((relation) => <button className="mvp-button mvp-button--secondary" key={`remove-${relation.relationId}`} onClick={() => void removeRelationship("favorite", relation.merchantId)}>Retirer {relation.shop.name} des favoris</button>)}</div></section>
    <section className="mvp-card mvp-card--full"><h2>Boutiques suivies</h2><p>Vous recevrez leurs nouveautés dans un digest quotidien.</p><div className="shop-directory-grid">{shopFollows.map((relation) => <ShopCard shop={relation.shop} key={relation.relationId} />)}</div>{!shopFollows.length && <p className="mvp-empty">Vous ne suivez aucune boutique pour le moment.</p>}<div className="mvp-actions">{shopFollows.map((relation) => <button className="mvp-button mvp-button--secondary" key={`remove-${relation.relationId}`} onClick={() => void removeRelationship("follow", relation.merchantId)}>Ne plus suivre {relation.shop.name}</button>)}</div></section>
  </div>;
}
