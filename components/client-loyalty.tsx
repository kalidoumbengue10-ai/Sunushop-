"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LoyaltyAccount = {
  id: string;
  balance_points: number;
  availablePoints: number;
  debtPoints: number;
  lifetime_earned_points: number;
  lifetime_redeemed_points: number;
  merchant_accounts: { public_name: string; slug: string } | Array<{ public_name: string; slug: string }>;
  expiringLots: Array<{ remaining_points: number; expires_at: string }>;
};

export function ClientLoyalty() {
  const [accounts, setAccounts] = useState<LoyaltyAccount[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/client/loyalty", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "Points indisponibles.");
        setAccounts(payload.data.accounts);
      })
      .catch((caught: Error) => setError(caught.message));
  }, []);
  const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;
  return <section className="mvp-card mvp-card--full client-loyalty">
    <div className="marketplace-section-heading"><div><span className="mvp-eyebrow">Fidélité</span><h2>Mes points par boutique</h2><p>1 point vaut 1 F CFA et peut réduire jusqu’à 20 % de votre prochaine commande.</p></div><span>{accounts.reduce((sum, account) => sum + account.availablePoints, 0)}</span></div>
    {error && <p className="mvp-alert mvp-alert--error">{error}</p>}
    <div className="client-loyalty__grid">{accounts.map((account) => {
      const merchant = one(account.merchant_accounts);
      const nextExpiry = account.expiringLots[0];
      return <article className="client-loyalty__card" key={account.id}><div><Link href={`/boutiques/${merchant.slug}`}><strong>{merchant.public_name}</strong></Link><small>{account.lifetime_earned_points} gagnés · {account.lifetime_redeemed_points} utilisés</small></div><b>{account.availablePoints} pts</b>{nextExpiry && <small>{nextExpiry.remaining_points} points expirent le {new Date(nextExpiry.expires_at).toLocaleDateString("fr-SN")}</small>}{account.debtPoints > 0 && <small>Les {account.debtPoints} prochains points compenseront un remboursement.</small>}</article>;
    })}</div>
    {!accounts.length && !error && <p className="mvp-empty">Vos points apparaîtront ici après une livraison dans une boutique participante.</p>}
  </section>;
}
