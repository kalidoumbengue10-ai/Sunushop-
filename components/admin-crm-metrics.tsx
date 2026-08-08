"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPrice } from "@/lib/marketplace";
import {
  ANALYTICS_PERIOD_PRESETS,
  rangeForPreset,
  type AnalyticsPeriodPreset,
} from "@/lib/domain/analytics-period";

type TopSeller = { merchantId: string; merchantName: string; units: number; revenueXof: number };

type Analytics = {
  summary: {
    subscriptionRevenueXof: number;
    approvedPaymentsCount: number;
    deliveredUnits: number;
    productRevenueXof: number;
    subscriptionRevenueChangePercent: number | null;
    productRevenueChangePercent: number | null;
  };
  topSellers: TopSeller[];
};

function Trend({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  const isDown = percent < 0;
  return (
    <span className={`dashboard-kpi__trend ${isDown ? "is-down" : ""}`}>
      {isDown ? <ArrowDownRight /> : <ArrowUpRight />}
      {Math.abs(percent)}% vs période précédente
    </span>
  );
}

export function AdminCrmMetrics() {
  const now = new Date();
  const [preset, setPreset] = useState<AnalyticsPeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [customTo, setCustomTo] = useState(now.toISOString().slice(0, 10));
  const [data, setData] = useState<Analytics>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAllSellers, setShowAllSellers] = useState(false);
  const range = useMemo(() => rangeForPreset(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ from: range.from, to: range.to });
      try {
        const response = await fetch(`/api/admin/analytics?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? "Impossible de charger les métriques.");
        if (!cancelled) setData(payload.data);
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "Erreur inattendue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const sellers = data?.topSellers ?? [];
  const visibleSellers = showAllSellers ? sellers.slice(0, 10) : sellers.slice(0, 5);

  return (
    <section className="admin-metrics">
      <div className="dashboard-toolbar">
        <div><span className="dashboard-toolbar__label">Période</span><p>Statistiques de la plateforme</p></div>
        <div className="dashboard-filters">
          {ANALYTICS_PERIOD_PRESETS.map(([value, label]) => (
            <button type="button" key={value} className={preset === value ? "is-active" : ""} onClick={() => setPreset(value)}>{label}</button>
          ))}
        </div>
      </div>
      {preset === "custom" && (
        <div className="dashboard-custom-range">
          <label>Du<input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} /></label>
          <label>Au<input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} /></label>
        </div>
      )}

      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}

      {loading && !data ? (
        <div className="dashboard-loading"><span /><span /><span /><span /><p>Chargement des métriques…</p></div>
      ) : data ? (
        <>
          <div className="dashboard-kpis">
            <article className="dashboard-kpi dashboard-kpi--primary">
              <div><small>CA ABONNEMENTS</small><strong>{formatPrice(data.summary.subscriptionRevenueXof)}</strong></div>
              <Trend percent={data.summary.subscriptionRevenueChangePercent} />
            </article>
            <article className="dashboard-kpi">
              <div><small>PAIEMENTS APPROUVÉS</small><strong>{data.summary.approvedPaymentsCount}</strong></div>
            </article>
            <article className="dashboard-kpi">
              <div><small>UNITÉS LIVRÉES</small><strong>{data.summary.deliveredUnits}</strong></div>
            </article>
            <article className="dashboard-kpi">
              <div><small>VALEUR PRODUITS LIVRÉS</small><strong>{formatPrice(data.summary.productRevenueXof)}</strong></div>
              <Trend percent={data.summary.productRevenueChangePercent} />
            </article>
          </div>

          <div className="dashboard-panel">
            <header><div><span className="dashboard-panel__eyebrow">Classement</span><h2>Top vendeurs</h2></div></header>
            {sellers.length === 0 ? (
              <p>Aucune commande livrée sur cette période.</p>
            ) : (
              <div className="dashboard-top-products">
                {visibleSellers.map((seller, index) => (
                  <article key={seller.merchantId}>
                    <span className="dashboard-rank">{index + 1}</span>
                    <div>
                      <strong>{seller.merchantName}</strong>
                      <small>{seller.units} unités · {formatPrice(seller.revenueXof)}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {sellers.length > 5 && (
              <button type="button" className="admin-text-button" onClick={() => setShowAllSellers((value) => !value)}>
                {showAllSellers ? "Réduire" : "Voir le top 10"}
              </button>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
