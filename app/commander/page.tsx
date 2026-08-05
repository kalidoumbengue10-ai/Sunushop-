import { CheckoutFlow } from "@/components/checkout-flow";
import { MvpShell } from "@/components/mvp-shell";

export default function CommanderPage() {
  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <span className="mvp-eyebrow">Commande</span>
          <h1 className="mvp-title">Finaliser ma commande</h1>
          <CheckoutFlow />
        </div>
      </main>
    </MvpShell>
  );
}
