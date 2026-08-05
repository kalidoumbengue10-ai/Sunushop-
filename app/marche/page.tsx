import { MarketplaceClient } from "@/components/marketplace-client";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export const dynamic = "force-dynamic";

export default async function MarchePage() {
  const admin = getAdminSupabase();
  const page = admin
    ? await new SupabaseCatalogRepository(admin)
        .listPage({ page: 1, limit: 24 })
        .catch(() => ({ products: [], total: 0 }))
    : { products: [], total: 0 };

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          {!admin && <SetupRequired />}
          <MarketplaceClient initialProducts={page.products} initialTotal={page.total} />
        </div>
      </main>
    </MvpShell>
  );
}
