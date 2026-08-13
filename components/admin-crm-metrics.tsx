"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Boxes, Store, Tags } from "lucide-react";
import { adminFetch } from "@/lib/admin/fetch";
import { formatPrice } from "@/lib/marketplace";
import {
  ANALYTICS_PERIOD_PRESETS,
  rangeForPreset,
  type AnalyticsPeriodPreset,
} from "@/lib/domain/analytics-period";

type RankedItem = {
  merchantId?: string;
  merchantName?: string;
  productId?: string;
  productName?: string;
  categoryId?: string;
  categoryName?: string;
  units: number;
  revenueXof: number;
};

type Analytics = {
  summary: {
    subscriptionRevenueXof: number;
    approvedPaymentsCount: number;
    deliveredUnits: number;
    productRevenueXof: number;
    paidOrdersCount: number;
    paidUnits: number;
    orderVolumeXof: number;
    refundsXof: number;
    subscriptionBreakdown: Record<string, number>;
    subscriptionRevenueChangePercent: number | null;
    productRevenueChangePercent: number | null;
  };
  topSellers: RankedItem[];
  topProducts: RankedItem[];
  topCategories: RankedItem[];
};

const originLabels: Record<string, string> = {
  payment: "Paiements encaissés",
  manual_grant: "Octrois manuels",
  test_activation: "Activations test",
  legacy: "Historique repris",
};

function Trend({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="dashboard-kpi__trend">Pas de période comparable</span>;
  const isDown = percent < 0;
  return (
    <span className={`dashboard-kpi__trend ${isDown ? "is-down" : ""}`}>
      {isDown ? <ArrowDownRight /> : <ArrowUpRight />}
      {Math.abs(percent)}% vs période précédente
    </span>
  );
}

function Ranking({
  icon,
  title,
  items,
  label,
}: {
  icon: React.ReactNode;
  title: string;
  items: RankedItem[];
  label: (item: RankedItem) => string;
}) {
  return (
    <article className="dashboard-panel admin-ranking-panel">
      <header><div><span className="dashboard-panel__eyebrow">Classement</span><h2>{title}</h2></div>{icon}</header>
      {items.length ? (
        <div className="dashboard-top-products">
          {items.slice(0, 10).map((item, index) => (
            <article key={item.merchantId ?? item.productId ?? item.categoryId}>
              <span className="dashboard-rank">{index + 1}</span>
              <div><strong>{label(item)}</strong><small>{item.units} unités · {formatPrice(item.revenueXof)}</small></div>
            </article>
          ))}
        </div>
      ) : <p>Aucune vente payée sur cette période.</p>}
    </article>
  );
}

export function AdminCrmMetrics({ refreshKey = 0, onLoaded }: { refreshKey?: number; onLoaded?: (date: Date) => void }) {
  const now = new Date();
  const [preset, setPreset] = useState<AnalyticsPeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [customTo, setCustomTo] = useState(now.toISOString().slice(0, 10));
  const [data, setData] = useState<Analytics>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const range = useMemo(() => rangeForPreset(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ from: range.from, to: range.to });
      try {
        const analytics = await adminFetch<Analytics>(`/api/admin/analytics?${params}`);
        if (!cancelled) {
          setData(analytics);
          onLoaded?.(new Date());
        }
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "Erreur inattendue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [range.from, range.to, refreshKey, onLoaded]);

  return (
    <section className="admin-metrics" aria-busy={loading}>
      <div className="dashboard-toolbar">
        <div><span className="dashboard-toolbar__label">Période</span><p>Les tests restent inclus et identifiés dans le détail.</p></div>
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
              <div><small>CA ABONNEMENTS SUNUSHOP</small><strong>{formatPrice(data.summary.subscriptionRevenueXof)}</strong></div>
              <Trend percent={data.summary.subscriptionRevenueChangePercent} />
            </article>
            <article className="dashboard-kpi dashboard-kpi--commerce">
              <div><small>VOLUME COMMANDES PAYÉES</small><strong>{formatPrice(data.summary.orderVolumeXof)}</strong></div>
              <Trend percent={data.summary.productRevenueChangePercent} />
            </article>
            <article className="dashboard-kpi"><div><small>COMMANDES PAYÉES</small><strong>{data.summary.paidOrdersCount}</strong></div><small>{data.summary.paidUnits} unités</small></article>
            <article className="dashboard-kpi"><div><small>REMBOURSEMENTS CONFIRMÉS</small><strong>{formatPrice(data.summary.refundsXof)}</strong></div></article>
          </div>

          <div className="admin-origin-breakdown">
            {Object.entries(data.summary.subscriptionBreakdown).map(([origin, amount]) => (
              <div key={origin}><span>{originLabels[origin] ?? origin}</span><strong>{formatPrice(amount)}</strong></div>
            ))}
            {!Object.keys(data.summary.subscriptionBreakdown).length && <p>Aucune valeur d’abonnement sur cette période.</p>}
          </div>

          <div className="admin-rankings-grid">
            <Ranking icon={<Store />} title="Commerçants" items={data.topSellers} label={(item) => item.merchantName ?? "Commerçant"} />
            <Ranking icon={<Boxes />} title="Produits" items={data.topProducts} label={(item) => `${item.productName ?? "Produit"}${item.merchantName ? ` · ${item.merchantName}` : ""}`} />
            <Ranking icon={<Tags />} title="Catégories" items={data.topCategories} label={(item) => item.categoryName ?? "Catégorie"} />
          </div>
        </>
      ) : null}
    </section>
  );
}
