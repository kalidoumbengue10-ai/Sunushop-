"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  TriangleAlert,
} from "lucide-react";
import { formatPrice } from "@/lib/marketplace";
import { merchantStatusLabel } from "@/lib/domain/merchant-ui";
import {
  ANALYTICS_PERIOD_PRESETS,
  rangeForPreset,
  type AnalyticsPeriodPreset,
} from "@/lib/domain/analytics-period";

type Analytics = {
  summary: {
    revenueXof: number;
    productRevenueXof: number;
    deliveryRevenueXof: number;
    deliveredOrders: number;
    createdOrders: number;
    averageOrderXof: number;
    previousRevenueXof: number;
    revenueChangePercent: number | null;
  };
  statusCounts: Record<string, number>;
  series: Array<{ periodStart: string; revenueXof: number; deliveredOrders: number; createdOrders: number }>;
  topProducts: Array<{ productId: string; title: string; unitsSold: number; revenueXof: number }>;
  lowStock: Array<{ variantId: string; title: string; variantTitle: string | null; sellable: number; threshold: number }>;
};

function formatShortDate(value: string, includeYear = false) {
  return new Intl.DateTimeFormat("fr-SN", {
    day: includeYear ? undefined : "2-digit",
    month: "short",
    year: includeYear ? "2-digit" : undefined,
    timeZone: "Africa/Dakar",
  }).format(new Date(value));
}

export function MerchantDashboard({ merchantId }: { merchantId: string }) {
  const now = new Date();
  const [preset, setPreset] = useState<AnalyticsPeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [customTo, setCustomTo] = useState(now.toISOString().slice(0, 10));
  const [data, setData] = useState<Analytics>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [abandonedCartCount, setAbandonedCartCount] = useState<number>();
  const range = useMemo(() => rangeForPreset(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    fetch(`/api/merchant/abandoned-carts?merchantId=${merchantId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (payload?.data) setAbandonedCartCount(payload.data.count); })
      .catch(() => undefined);
  }, [merchantId]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ merchantId, ...range });
    fetch(`/api/merchant/analytics?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "Statistiques indisponibles.");
        return payload.data as Analytics;
      })
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") {
          setError(reason.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [merchantId, range]);

  const maxRevenue = Math.max(1, ...(data?.series.map((item) => item.revenueXof) ?? [1]));
  const chartPoints = (data?.series ?? []).map((item, index, values) => ({
    ...item,
    x: values.length === 1 ? 300 : 28 + (index / (values.length - 1)) * 544,
    y: 186 - (item.revenueXof / maxRevenue) * 158,
  }));
  const polyline = chartPoints.map((item) => `${item.x},${item.y}`).join(" ");
  const area = chartPoints.length ? `M ${chartPoints[0].x} 186 L ${polyline.replaceAll(",", " ")} L ${chartPoints.at(-1)?.x ?? 572} 186 Z` : "";
  const topUnits = Math.max(1, ...(data?.topProducts.map((item) => item.unitsSold) ?? [1]));
  const totalStatuses = Math.max(1, Object.values(data?.statusCounts ?? {}).reduce((sum, count) => sum + count, 0));
  const startRefresh = () => {
    setLoading(true);
    setError("");
  };

  return (
    <div className="merchant-dashboard">
      <div className="dashboard-toolbar">
        <div>
          <span className="dashboard-toolbar__label">Période analysée</span>
          <p>Le chiffre d’affaires est comptabilisé quand la commande est livrée.</p>
        </div>
        <div className="dashboard-filters" role="group" aria-label="Choisir une période">
          {ANALYTICS_PERIOD_PRESETS.map(([value, label]) => (
            <button type="button" className={preset === value ? "is-active" : ""} onClick={() => { startRefresh(); setPreset(value); }} key={value}>{label}</button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="dashboard-custom-range">
          <label>Du<input type="date" value={customFrom} max={customTo} onChange={(event) => { startRefresh(); setCustomFrom(event.target.value); }} /></label>
          <label>Au<input type="date" value={customTo} min={customFrom} onChange={(event) => { startRefresh(); setCustomTo(event.target.value); }} /></label>
        </div>
      )}

      {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
      {loading && (
        <div className="dashboard-loading" aria-live="polite">
          <span /><span /><span /><span />
          <p>Calcul de vos indicateurs…</p>
        </div>
      )}

      {data && !loading && (
        <>
          <section className="dashboard-kpis" aria-label="Indicateurs principaux">
            <article className="dashboard-kpi dashboard-kpi--primary">
              <span className="dashboard-kpi__icon"><Banknote /></span>
              <div><small>Chiffre d’affaires livré</small><strong>{formatPrice(data.summary.revenueXof)}</strong></div>
              <span className={`dashboard-kpi__trend ${data.summary.revenueChangePercent !== null && data.summary.revenueChangePercent < 0 ? "is-down" : ""}`}>
                {data.summary.revenueChangePercent === null ? "Pas encore de comparaison" : <>{data.summary.revenueChangePercent >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}{Math.abs(data.summary.revenueChangePercent)} % vs période précédente</>}
              </span>
            </article>
            <article className="dashboard-kpi">
              <span className="dashboard-kpi__icon"><ShoppingBag /></span>
              <div><small>Commandes reçues</small><strong>{data.summary.createdOrders}</strong></div>
              <p><b>{data.summary.deliveredOrders}</b> livrée{data.summary.deliveredOrders > 1 ? "s" : ""}</p>
            </article>
            <article className="dashboard-kpi">
              <span className="dashboard-kpi__icon"><ReceiptText /></span>
              <div><small>Panier moyen</small><strong>{formatPrice(data.summary.averageOrderXof)}</strong></div>
              <p>Sur les commandes livrées</p>
            </article>
            <article className="dashboard-kpi">
              <span className="dashboard-kpi__icon"><PackageCheck /></span>
              <div><small>Ventes de produits</small><strong>{formatPrice(data.summary.productRevenueXof)}</strong></div>
              <p>Livraison : <b>{formatPrice(data.summary.deliveryRevenueXof)}</b></p>
            </article>
            <article className="dashboard-kpi">
              <span className="dashboard-kpi__icon"><ShoppingCart /></span>
              <div><small>Paniers abandonnés</small><strong>{abandonedCartCount ?? "—"}</strong></div>
              <p>Sans commande depuis plus de 24 h</p>
            </article>
          </section>

          <div className="dashboard-primary-grid">
            <section className="dashboard-panel dashboard-chart">
              <header><div><span className="dashboard-panel__eyebrow">Performance</span><h2>Évolution du chiffre d’affaires</h2></div><strong>{formatPrice(data.summary.revenueXof)}</strong></header>
              {chartPoints.length ? (
                <div className="dashboard-chart__canvas">
                  <svg viewBox="0 0 600 220" role="img" aria-label="Courbe du chiffre d’affaires livré">
                    {[28, 81, 134, 186].map((y) => <line key={y} x1="28" y1={y} x2="572" y2={y} />)}
                    <path className="dashboard-chart__area" d={area} />
                    <polyline points={polyline} />
                    {chartPoints.map((point) => <circle key={point.periodStart} cx={point.x} cy={point.y} r="4"><title>{formatShortDate(point.periodStart)} : {formatPrice(point.revenueXof)}</title></circle>)}
                  </svg>
                  <div className="dashboard-chart-labels">
                    {chartPoints.map((item, index) => index % Math.max(1, Math.ceil(chartPoints.length / 6)) === 0 && <span key={item.periodStart}>{formatShortDate(item.periodStart, preset === "year")}</span>)}
                  </div>
                </div>
              ) : <div className="dashboard-empty"><Banknote /><h3>Aucune vente livrée</h3><p>La courbe apparaîtra dès qu’une première commande sera livrée sur cette période.</p></div>}
            </section>

            <section className="dashboard-panel dashboard-top-products">
              <header><div><span className="dashboard-panel__eyebrow">Catalogue</span><h2>Produits les plus vendus</h2></div></header>
              {data.topProducts.slice(0, 5).map((product, index) => (
                <article key={product.productId}>
                  <span className="dashboard-rank">{index + 1}</span>
                  <div><strong>{product.title}</strong><small>{product.unitsSold} unité{product.unitsSold > 1 ? "s" : ""} · {formatPrice(product.revenueXof)}</small><i><span style={{ width: `${(product.unitsSold / topUnits) * 100}%` }} /></i></div>
                </article>
              ))}
              {!data.topProducts.length && <div className="dashboard-empty dashboard-empty--compact"><Boxes /><p>Le classement apparaîtra après vos premières ventes livrées.</p></div>}
            </section>
          </div>

          <div className="dashboard-secondary-grid">
            <section className="dashboard-panel dashboard-statuses">
              <header><div><span className="dashboard-panel__eyebrow">Commandes</span><h2>Répartition par statut</h2></div></header>
              <div>
                {Object.entries(data.statusCounts).map(([status, count]) => (
                  <article key={status}><span className="mvp-status" data-status={status}>{merchantStatusLabel(status)}</span><i><span style={{ width: `${(count / totalStatuses) * 100}%` }} /></i><strong>{count}</strong></article>
                ))}
                {!Object.keys(data.statusCounts).length && <p className="mvp-empty">Aucune commande sur cette période.</p>}
              </div>
            </section>

            <section className="dashboard-panel dashboard-stock">
              <header><div><span className="dashboard-panel__eyebrow">Stock</span><h2>À surveiller</h2></div><span className="dashboard-stock__count"><TriangleAlert />{data.lowStock.length}</span></header>
              <div>
                {data.lowStock.slice(0, 6).map((item) => (
                  <article key={item.variantId}><span className="dashboard-stock__icon"><Boxes /></span><div><strong>{item.title}</strong><small>{item.variantTitle || "Variante standard"} · seuil {item.threshold}</small></div><span className={item.sellable === 0 ? "is-empty" : ""}>{item.sellable} dispo.</span></article>
                ))}
                {!data.lowStock.length && <div className="dashboard-empty dashboard-empty--compact"><PackageCheck /><p>Tous vos stocks sont au-dessus de leur seuil d’alerte.</p></div>}
              </div>
            </section>
          </div>

          <details className="dashboard-data-table">
            <summary>Consulter les données détaillées</summary>
            <div className="mvp-table-wrap"><table className="mvp-table"><thead><tr><th>Période</th><th>CA livré</th><th>Commandes reçues</th><th>Commandes livrées</th></tr></thead><tbody>{data.series.map((item) => <tr key={item.periodStart}><td>{new Date(item.periodStart).toLocaleDateString("fr-SN")}</td><td>{formatPrice(item.revenueXof)}</td><td>{item.createdOrders}</td><td>{item.deliveredOrders}</td></tr>)}</tbody></table></div>
          </details>
        </>
      )}
    </div>
  );
}
