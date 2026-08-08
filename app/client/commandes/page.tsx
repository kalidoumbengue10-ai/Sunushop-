import { redirect } from "next/navigation";
import { ClientOrders } from "@/components/client-orders";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientCommandesPage() {
  const supabase = await getServerSupabase();
  if (!supabase) return <MvpShell><main className="mvp-main"><div className="mvp-shell"><SetupRequired /></div></main></MvpShell>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?profil=client&next=/client/commandes");

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <ClientOrders />
        </div>
      </main>
    </MvpShell>
  );
}
