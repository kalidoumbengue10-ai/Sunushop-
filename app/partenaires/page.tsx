import Link from "next/link";
import { redirect } from "next/navigation";
import { MvpShell } from "@/components/mvp-shell";
import { SetupRequired } from "@/components/setup-required";
import { getServerSupabase } from "@/lib/infrastructure/supabase/server";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
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

  if (!user) redirect("/connexion?profil=partenaire&next=/partenaires");

  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <span className="mvp-eyebrow">Espace partenaire</span>
          <h1 className="mvp-title">Coordonnons le commerce local.</h1>
          <p className="mvp-lede">
            Cet espace accueille les partenaires validés de livraison, paiement
            et opérations qui contribuent aux parcours SunuShop.
          </p>
          <div className="mvp-grid">
            <section className="mvp-card mvp-card--third">
              <h2>Livraison</h2>
              <p>Zones, délais et incidents partagés avec les équipes concernées.</p>
            </section>
            <section className="mvp-card mvp-card--third">
              <h2>Paiement</h2>
              <p>Coordination des moyens de paiement directs et de leur suivi.</p>
            </section>
            <section className="mvp-card mvp-card--third">
              <h2>Opérations</h2>
              <p>Un point de contact clair pour les parcours et engagements pilotes.</p>
            </section>
            <section className="mvp-card mvp-card--full">
              <h2>Accès contrôlé</h2>
              <p className="mvp-alert">
                L’activation des outils partenaires intervient après validation
                de votre organisation par SunuShop.
              </p>
              <div className="mvp-actions">
                <a className="mvp-button" href="mailto:partenaires@sunushop.sn">
                  Contacter SunuShop
                </a>
                <Link className="mvp-button mvp-button--secondary" href="/">
                  Retour au site
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </MvpShell>
  );
}

