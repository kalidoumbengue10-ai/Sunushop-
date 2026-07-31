import { MarketplaceClient } from "@/components/marketplace-client";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export const dynamic = "force-dynamic";

export default async function MarchePage() {
  const admin = getAdminSupabase();
  const products = admin
    ? await new SupabaseCatalogRepository(admin)
        .list({ limit: 60 })
        .catch(() => [])
    : [];

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          {!admin && <SetupRequired />}
          <MarketplaceClient initialProducts={products} />
        </div>
      </main>
    </MvpShell>
  );
}
