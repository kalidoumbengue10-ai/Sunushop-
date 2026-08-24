"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, Heart } from "lucide-react";
import { useShopRelationships } from "@/components/favorites-provider";
import { clientLoginHref } from "@/lib/domain/client-navigation";

type ShopFollowButtonProps = {
  merchantId: string;
  merchantSlug: string;
  variant?: "button" | "icon";
};

export function ShopRelationshipActions({ merchantId, merchantSlug, variant = "button" }: ShopFollowButtonProps) {
  const { authenticated, isFollowing, isFavorite, toggleFollow, toggleFavorite } = useShopRelationships();
  const [busy, setBusy] = useState<"follow" | "favorite" | null>(null);
  const following = isFollowing(merchantId);
  const favorite = isFavorite(merchantId);
  const loginHref = clientLoginHref(`/boutiques/${merchantSlug}`);

  if (authenticated === false) {
    if (variant === "icon") {
      return (
        <div className="shop-relation-icons">
          <Link href={loginHref} className="shop-relation-icon" aria-label="Se connecter pour suivre cette boutique" onClick={(event) => event.stopPropagation()}>
            <Bell aria-hidden="true" />
          </Link>
          <Link href={loginHref} className="shop-relation-icon" aria-label="Se connecter pour ajouter cette boutique aux favoris" onClick={(event) => event.stopPropagation()}>
            <Heart aria-hidden="true" />
          </Link>
        </div>
      );
    }
    return (
      <div className="mvp-actions">
        <Link href={loginHref} className="mvp-button mvp-button--secondary" aria-label="Se connecter pour suivre cette boutique"><Bell aria-hidden="true" /> Suivre</Link>
        <Link href={loginHref} className="mvp-button mvp-button--secondary" aria-label="Se connecter pour ajouter cette boutique aux favoris"><Heart aria-hidden="true" /> Favori</Link>
      </div>
    );
  }

  const handleToggle = async (event: React.MouseEvent, kind: "follow" | "favorite") => {
    event.preventDefault();
    event.stopPropagation();
    setBusy(kind);
    try {
      await (kind === "follow" ? toggleFollow(merchantId) : toggleFavorite(merchantId));
    } catch {
      // Le provider restaure l'état optimiste et affiche l'erreur à l'utilisateur.
    } finally {
      setBusy(null);
    }
  };

  if (variant === "icon") {
    return (
      <div className="shop-relation-icons">
        <button type="button" className={following ? "shop-relation-icon is-active" : "shop-relation-icon"} onClick={(event) => void handleToggle(event, "follow")} disabled={busy !== null || authenticated === null} aria-pressed={following} aria-label={following ? "Ne plus suivre cette boutique" : "Suivre cette boutique"}>
          <Bell aria-hidden="true" fill={following ? "currentColor" : "none"} />
        </button>
        <button type="button" className={favorite ? "shop-relation-icon is-active" : "shop-relation-icon"} onClick={(event) => void handleToggle(event, "favorite")} disabled={busy !== null || authenticated === null} aria-pressed={favorite} aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}>
          <Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
    );
  }

  return (
    <div className="mvp-actions">
      <button type="button" className={following ? "mvp-button" : "mvp-button mvp-button--secondary"} onClick={(event) => void handleToggle(event, "follow")} disabled={busy !== null || authenticated === null} aria-pressed={following}>
        <Bell aria-hidden="true" fill={following ? "currentColor" : "none"} />
        {following ? "Boutique suivie" : "Suivre cette boutique"}
      </button>
      <button type="button" className={favorite ? "mvp-button" : "mvp-button mvp-button--secondary"} onClick={(event) => void handleToggle(event, "favorite")} disabled={busy !== null || authenticated === null} aria-pressed={favorite}>
        <Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
        {favorite ? "Dans mes favoris" : "Ajouter aux favoris"}
      </button>
    </div>
  );
}

export const ShopFollowButton = ShopRelationshipActions;
