import Link from "next/link";
import { MvpShell } from "@/components/mvp-shell";
import { getAdminSupabase } from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function CategoriesIndexPage() {
  const admin = getAdminSupabase();
  const { data: categories } = admin
    ? await admin.from("categories").select("id, slug, name, description").eq("active", true).order("position")
    : { data: [] };

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <section className="mvp-card mvp-card--full">
            <span className="mvp-eyebrow">Catégories</span>
            <h1 className="mvp-title">Parcourir par catégorie</h1>
          </section>
          <div className="categories-index-grid">
            {(categories ?? []).map((category) => (
              <Link href={`/categories/${category.slug}`} className="categories-index-card" key={category.id}>
                <h2>{category.name}</h2>
                {category.description && <p>{category.description}</p>}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </MvpShell>
  );
}
