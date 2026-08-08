"use client";

import Link from "next/link";
import { useState } from "react";
import { Heart } from "lucide-react";
import { useFavorites } from "@/components/favorites-provider";

type ShopFollowButtonProps = {
  merchantId: string;
  variant?: "button" | "icon";
};

export function ShopFollowButton({ merchantId, variant = "button" }: ShopFollowButtonProps) {
  const { authenticated, isFollowing, toggle } = useFavorites();
  const [busy, setBusy] = useState(false);
  const following = isFollowing(merchantId);

  if (authenticated === false) {
    if (variant === "icon") {
      return (
        <Link
          href="/connexion?profil=client&next=/boutiques"
          className="shop-favorite-icon"
          aria-label="Se connecter pour suivre cette boutique"
          onClick={(event) => event.stopPropagation()}
        >
          <Heart aria-hidden="true" />
        </Link>
      );
    }
    return (
      <Link href={`/connexion?profil=client&next=/boutiques`} className="mvp-button mvp-button--secondary">
        Se connecter pour suivre
      </Link>
    );
  }

  const handleToggle = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    try {
      await toggle(merchantId);
    } finally {
      setBusy(false);
    }
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        className={following ? "shop-favorite-icon is-active" : "shop-favorite-icon"}
        onClick={handleToggle}
        disabled={busy || authenticated === null}
        aria-pressed={following}
        aria-label={following ? "Retirer des favoris" : "Ajouter aux favoris"}
      >
        <Heart aria-hidden="true" fill={following ? "currentColor" : "none"} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={following ? "mvp-button" : "mvp-button mvp-button--secondary"}
      onClick={handleToggle}
      disabled={busy || authenticated === null}
    >
      {following ? "♥ Boutique suivie" : "♡ Suivre cette boutique"}
    </button>
  );
}
