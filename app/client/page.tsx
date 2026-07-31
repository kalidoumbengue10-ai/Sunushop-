import Link from "next/link";
import { redirect } from "next/navigation";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientPage() {
  const supabase = await getServerSupabase();

  if (!supabase) {
    return (
      <MvpShell>
        <main className="mvp-main">
          <div className="mvp-shell"><SetupRequired /></div>
        </main>
      </MvpShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?profil=client&next=/client");

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <span className="mvp-eyebrow">Espace client</span>
          <h1 className="mvp-title">Bonjour, votre marché vous attend.</h1>
          <p className="mvp-lede">
            Retrouvez les accès utiles pour acheter, suivre une commande et
            contacter une boutique SunuShop.
          </p>
          <div className="mvp-grid">
            <section className="mvp-card">
              <h2>Explorer le marché</h2>
              <p>Parcourez les boutiques et préparez une nouvelle commande.</p>
              <Link className="mvp-button" href="/marche">Voir les produits</Link>
            </section>
            <section className="mvp-card">
              <h2>Suivre une commande</h2>
              <p>
                Ouvrez le lien de suivi reçu lors de votre commande pour voir
                son historique horodaté.
              </p>
              <Link className="mvp-button mvp-button--secondary" href="/marche">
                Retrouver le marché
              </Link>
            </section>
            <section className="mvp-card mvp-card--full">
              <h2>Compte connecté</h2>
              <p className="mvp-alert">
                Votre accès client est actif avec l’adresse email associée à
                votre compte SunuShop.
              </p>
            </section>
          </div>
        </div>
      </main>
    </MvpShell>
  );
}
