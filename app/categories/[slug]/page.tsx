import { notFound } from "next/navigation";
import { MarketplaceClient } from "@/components/marketplace-client";
import { MvpShell } from "@/components/mvp-shell";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";
import { SupabaseCatalogRepository } from "@/lib/infrastructure/supabase/repositories";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = getAdminSupabase();
  if (!admin) notFound();

  const [{ data: category }, categories, page] = await Promise.all([
    admin.from("categories").select("id, slug, name, description").eq("slug", slug).eq("active", true).maybeSingle(),
    admin.from("categories").select("id, slug, name").eq("active", true).order("position").then(({ data }) => data ?? []),
    new SupabaseCatalogRepository(admin).listPage({ page: 1, limit: 24, category: slug }).catch(() => ({ products: [], total: 0 })),
  ]);
  if (!category) notFound();

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <section className="mvp-card mvp-card--full">
            <span className="mvp-eyebrow">Catégorie</span>
            <h1 className="mvp-title">{category.name}</h1>
            {category.description && <p className="mvp-lede">{category.description}</p>}
          </section>
          <MarketplaceClient
            initialProducts={page.products}
            initialTotal={page.total}
            initialCategories={categories}
            initialCategorySlug={category.slug}
          />
        </div>
      </main>
    </MvpShell>
  );
}
