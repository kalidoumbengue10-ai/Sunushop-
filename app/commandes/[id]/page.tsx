import { MvpShell } from "@/components/mvp-shell";
import { OrderTracking } from "@/components/order-tracking";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <span className="mvp-eyebrow">Suivi de commande</span>
          <OrderTracking orderId={id} />
        </div>
      </main>
    </MvpShell>
  );
}
