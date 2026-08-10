"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/marketplace";

type Payload = {
  settings: { accrual_enabled: boolean };
  accounts: Array<{ id: string; customerName: string; balance_points: number; lifetime_earned_points: number; lifetime_redeemed_points: number }>;
  payouts: Array<{ id: string; amount_xof: number; period_start: string; period_end: string; service: string; status: string }>;
  totals: { customers: number; outstandingPoints: number; platformContributionXof: number };
};

export function MerchantLoyalty({ merchantId }: { merchantId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/merchant/loyalty?merchantId=${merchantId}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Fidélité indisponible.");
    setData(payload.data);
  }, [merchantId]);
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled) load().catch((caught: Error) => setError(caught.message)); }); return () => { cancelled = true; }; }, [load]);
  const toggle = async () => {
    if (!data) return;
    setBusy(true); setError("");
    const response = await fetch("/api/merchant/loyalty", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchantId, accrualEnabled: !data.settings.accrual_enabled }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload.error?.message ?? "Réglage non enregistré.");
    await load();
  };
  return <div className="merchant-loyalty">
    <section className="mvp-card mvp-card--full"><div className="marketplace-section-heading"><div><span className="mvp-eyebrow">Programme boutique</span><h2>Points de fidélité</h2><p>100 F de produits livrés = 1 point. La remise est financée à parts égales avec SunuShop.</p></div><button type="button" className={data?.settings.accrual_enabled ? "mvp-button mvp-button--secondary" : "mvp-button"} disabled={busy || !data} onClick={() => void toggle()}>{data?.settings.accrual_enabled ? "Suspendre les nouveaux gains" : "Activer le programme"}</button></div>{error && <p className="mvp-alert mvp-alert--error">{error}</p>}</section>
    {data && <><section className="merchant-kpi-grid"><article><span>Clients fidélisés</span><strong>{data.totals.customers}</strong></article><article><span>Points en circulation</span><strong>{data.totals.outstandingPoints}</strong></article><article><span>Part SunuShop cumulée</span><strong>{formatPrice(data.totals.platformContributionXof)}</strong></article></section><section className="mvp-card"><h3>Soldes clients</h3><div className="mvp-list">{data.accounts.map((account) => <div className="mvp-row" key={account.id}><div><strong>{account.customerName}</strong><small>{account.lifetime_earned_points} gagnés · {account.lifetime_redeemed_points} utilisés</small></div><b>{Math.max(0, account.balance_points)} pts</b></div>)}</div>{!data.accounts.length && <p className="mvp-empty">Aucun client fidélisé pour le moment.</p>}</section><section className="mvp-card"><h3>Remboursements SunuShop</h3><div className="mvp-list">{data.payouts.map((payout) => <div className="mvp-row" key={payout.id}><div><strong>{formatPrice(payout.amount_xof)}</strong><small>{payout.service} · {new Date(payout.period_start).toLocaleDateString("fr-SN")}</small></div><span className="mvp-status" data-status={payout.status}>{payout.status}</span></div>)}</div>{!data.payouts.length && <p className="mvp-empty">Les crédits d’au moins 1 000 F sont regroupés chaque mois.</p>}</section></>}
  </div>;
}
