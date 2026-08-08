"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Grid2x2, House, MessageSquare, ShoppingBag, UserRound } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { useAuthState } from "@/components/auth-state-provider";

export function MobileTabBar() {
  const pathname = usePathname();
  const cart = useCart();
  const { authenticated } = useAuthState();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!authenticated) return;
    const load = () => {
      fetch("/api/conversations/unread-count")
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => { if (payload?.data) setUnreadCount(payload.data.count); })
        .catch(() => undefined);
    };
    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, [authenticated]);

  const accountHref = pathname.startsWith("/marchand")
    ? "/marchand"
    : authenticated
      ? "/client"
      : "/connexion";

  const tabs = [
    { href: "/", label: "Accueil", icon: House, isActive: pathname === "/" },
    { href: "/categories", label: "Catégories", icon: Grid2x2, isActive: pathname.startsWith("/categories") },
    { href: "#panier", label: "Panier", icon: ShoppingBag, isActive: false, onClick: cart.open, badge: cart.itemCount || undefined },
    { href: "/messages", label: "Messages", icon: MessageSquare, isActive: pathname.startsWith("/messages"), badge: unreadCount || undefined },
    { href: accountHref, label: "Compte", icon: UserRound, isActive: pathname.startsWith("/client") || pathname.startsWith("/marchand") || pathname.startsWith("/connexion") },
  ];

  return (
    <nav className="mobile-tab-bar" aria-label="Navigation mobile principale">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const content = (
          <>
            <span className="mobile-tab-bar__icon">
              <Icon aria-hidden="true" />
              {Boolean(tab.badge) && <span className="mobile-tab-bar__badge">{tab.badge}</span>}
            </span>
            <span>{tab.label}</span>
          </>
        );
        if (tab.onClick) {
          return (
            <button type="button" key={tab.label} className={tab.isActive ? "is-active" : ""} onClick={tab.onClick}>
              {content}
            </button>
          );
        }
        return (
          <Link key={tab.label} href={tab.href} className={tab.isActive ? "is-active" : ""}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
