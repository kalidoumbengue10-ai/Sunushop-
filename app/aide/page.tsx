import { FaqAccordion } from "@/app/faq-accordion";
import { AideSupportButton } from "@/components/aide-support-button";
import { MvpShell } from "@/components/mvp-shell";

const faqs = [
  { question: "Comment suivre ma commande ?", answer: "Connectez-vous puis ouvrez « Mes commandes » depuis votre espace client. Chaque commande affiche son statut et son code de réception." },
  { question: "Comment contacter la boutique qui a mon produit ?", answer: "Depuis la page de la boutique ou depuis le détail de votre commande, utilisez le bouton « Contacter la boutique » ou « Discuter de cette commande »." },
  { question: "Le retrait en boutique n'apparaît pas, pourquoi ?", answer: "Le retrait n'est proposé que si le commerçant l'a activé pour sa boutique. Contactez-le directement si vous pensez qu'il s'agit d'une erreur." },
  { question: "J'ai un problème avec ma commande ou mon paiement", answer: "Ouvrez le détail de la commande concernée et utilisez « Contacter le SAV SunuShop », ou écrivez-nous ci-dessous." },
];

export default function AidePage() {
  return (
    <MvpShell>
      <main className="mvp-main">
        <div className="mvp-shell">
          <section className="mvp-card mvp-card--full">
            <span className="mvp-eyebrow">Aide</span>
            <h1 className="mvp-title">Comment pouvons-nous vous aider ?</h1>
            <p className="mvp-lede">
              Une question sur une commande précise ? Ouvrez-la directement et contactez la boutique.
              Pour toute autre demande, l’équipe SunuShop vous répond ici.
            </p>
            <div className="mvp-actions">
              <AideSupportButton />
              <a className="mvp-button mvp-button--secondary" href="mailto:sunushop1@gmail.com">
                sunushop1@gmail.com
              </a>
            </div>
          </section>
          <section className="mvp-card mvp-card--full">
            <h2>Questions fréquentes</h2>
            <FaqAccordion faqs={faqs} />
          </section>
        </div>
      </main>
    </MvpShell>
  );
}
