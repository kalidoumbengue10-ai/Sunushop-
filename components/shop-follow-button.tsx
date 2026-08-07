"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ShopFollowButtonProps = {
  merchantId: string;
};

export function ShopFollowButton({ merchantId }: ShopFollowButtonProps) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/client/shop-follows")
      .then((response) => {
        setAuthenticated(response.ok);
        return response.ok ? response.json() : null;
      })
      .then((payload) => {
        if (!payload?.data?.items) return;
        const items = payload.data.items as Array<{ merchant_id: string }>;
        setFollowing(items.some((item) => item.merchant_id === merchantId));
      })
      .catch(() => setAuthenticated(false));
  }, [merchantId]);

  if (authenticated === false) {
    return (
      <Link href={`/connexion?profil=client&next=/boutiques`} className="mvp-button mvp-button--secondary">
        Se connecter pour suivre
      </Link>
    );
  }

  const toggleFollow = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/client/shop-follows", {
        method: following ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchantId }),
      });
      if (response.ok) setFollowing(!following);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={following ? "mvp-button" : "mvp-button mvp-button--secondary"}
      onClick={toggleFollow}
      disabled={busy || authenticated === null}
    >
      {following ? "♥ Boutique suivie" : "♡ Suivre cette boutique"}
    </button>
  );
}
