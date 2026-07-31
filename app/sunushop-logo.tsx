import { ShoppingBag } from "lucide-react";

export function SunuShopLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`ss-logo ${compact ? "ss-logo--compact" : ""}`}>
      <span className="ss-logo__symbol" aria-hidden="true">
        <span className="ss-logo__sun" />
        <ShoppingBag />
      </span>
      {!compact && (
        <span className="ss-logo__wordmark">
          Sunu<span>Shop</span>
        </span>
      )}
    </span>
  );
}

