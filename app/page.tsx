"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  MapPin,
  Menu,
  Phone,
  X,
} from "lucide-react";

const dishes = [
  {
    id: "thieb",
    index: "01",
    name: "Ceebu jën",
    description: "Riz rouge, poisson et légumes mijotés — le grand plat de la table sénégalaise.",
    price: "3 500 FCFA",
    image: "/images/hero-teranga.png",
  },
  {
    id: "yassa",
    index: "02",
    name: "Yassa poulet",
    description: "Poulet braisé, citron et oignons fondants, servi avec son riz blanc.",
    price: "3 000 FCFA",
    image: "/images/yassa.png",
  },
  {
    id: "dibi",
    index: "03",
    name: "Dibi mouton",
    description: "Mouton saisi au feu, oignons frais et moutarde relevée.",
    price: "6 000 FCFA",
    image: "/images/dibi.png",
  },
  {
    id: "pastels",
    index: "04",
    name: "Pastels de poisson",
    description: "Petits chaussons dorés, farce de poisson et sauce tomate maison.",
    price: "1 500 FCFA",
    image: "/images/pastels.png",
  },
];

const steps = [
  ["01", "Choisissez votre plat", "Parcourez les recettes et leurs options."],
  ["02", "Précisez votre envie", "Indiquez votre choix à l’équipe de la maison."],
  ["03", "Confirmez les détails", "L’équipe confirme le service et la disponibilité."],
  ["04", "Passez à table", "Sur place, à emporter ou en livraison selon disponibilité."],
];

const faqs = [
  {
    question: "Peut-on commander en livraison ?",
    answer: "La livraison à Dakar est prévue dans cette proposition. La zone exacte et les délais restent à confirmer avec le restaurant.",
  },
  {
    question: "Comment signaler une allergie ?",
    answer: "Indiquez votre allergie dans les préférences de commande et confirmez-la directement avec l’équipe avant validation.",
  },
  {
    question: "Peut-on commander pour un groupe ?",
    answer: "Une commande de groupe est possible depuis la carte. Pour une privatisation ou un grand volume, les conditions restent à confirmer.",
  },
  {
    question: "Quels moyens de paiement sont proposés ?",
    answer: "Wave, Orange Money, Free Money et le paiement en espèces sont proposés dans la maquette. Les moyens définitifs restent à confirmer.",
  },
];

function ArrowButton({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={`pill-button ${light ? "pill-button--light" : ""}`}>
      <span>{children}</span>
      <span className="pill-button__icon" aria-hidden="true"><ArrowUpRight size={14} /></span>
    </span>
  );
}

function SectionLabel({ number, children, aside }: { number: string; children: React.ReactNode; aside?: string }) {
  return (
    <div className="section-label">
      <div><span className="section-label__dot" /><span>{number} — {children}</span></div>
      {aside && <span className="section-label__aside">{aside}</span>}
    </div>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const closeMenu = () => setMenuOpen(false);

  return (
    <main id="top" className="restaurant-page">
      <header className="site-header">
        <Link href="#top" className="brand-mark" onClick={closeMenu} aria-label="Kër Ndar, retour en haut">
          <span>Kër</span><span>Ndar</span>
        </Link>

        <nav className="desktop-nav" aria-label="Navigation principale">
          <Link href="#carte">La carte</Link>
          <Link href="#experience">L’expérience</Link>
          <Link href="#maison">La maison</Link>
          <Link href="#questions">Questions</Link>
        </nav>

        <div className="header-actions">
          <a href="#contact" className="header-icon" aria-label="Voir les informations de contact"><Phone size={15} /></a>
          <Link href="#contact"><ArrowButton light>Contacter la maison</ArrowButton></Link>
        </div>

        <button
          className="mobile-menu-button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>

        <nav id="mobile-navigation" className={`mobile-nav ${menuOpen ? "is-open" : ""}`} aria-label="Navigation mobile">
          <Link href="#carte" onClick={closeMenu}>La carte</Link>
          <Link href="#experience" onClick={closeMenu}>L’expérience</Link>
          <Link href="#maison" onClick={closeMenu}>La maison</Link>
          <Link href="#questions" onClick={closeMenu}>Questions</Link>
          <Link href="#contact" onClick={closeMenu}><ArrowButton>Contacter la maison</ArrowButton></Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <Image src="/images/hero-teranga.png" alt="Grand plat de ceebu jën dressé sur une table chaleureuse à Dakar" fill priority sizes="100vw" className="cover-image" />
        <div className="hero__veil" />
        <div className="hero-proof">
          <span className="hero-proof__seal">KN</span>
          <span>Carte sénégalaise<br />Dakar · Sénégal</span>
        </div>
        <div className="hero__content">
          <p className="eyebrow">Cuisine sénégalaise · Table contemporaine</p>
          <h1 id="hero-title">Le Sénégal<br />se met à table.</h1>
          <div className="hero__actions">
            <Link href="#carte"><ArrowButton light>Voir la carte</ArrowButton></Link>
            <Link href="#carte" className="text-link text-link--light">Voir les plats <ArrowDown size={15} /></Link>
          </div>
        </div>
        <a href="#introduction" className="scroll-cue">Défiler <ArrowDown size={14} /></a>
      </section>

      <section id="introduction" className="section-shell intro-section">
        <SectionLabel number="01" aside="Dakar, Sénégal">La table</SectionLabel>
        <p className="intro-statement">
          Des recettes qui prennent leur temps, des produits qui ont du goût et une table pensée pour <span className="circled-word">partager</span> — ici, la <span className="circled-word circled-word--dark">teranga</span> se commande <em>sans attendre.</em>
        </p>
        <div className="trust-strip" aria-label="Services proposés">
          <span>Cuisine sénégalaise</span>
          <span>Paiement local</span>
          <span>Sur place · À emporter</span>
          <span>Livraison à Dakar</span>
        </div>
      </section>

      <section id="carte" className="section-shell menu-section">
        <div className="section-intro">
          <div>
            <SectionLabel number="02">Les incontournables</SectionLabel>
            <h2>Quatre façons<br />de commencer.</h2>
          </div>
          <p>Une sélection courte de plats emblématiques pour présenter la future carte. Les visuels proposés partagent la même lumière et le même geste éditorial.</p>
        </div>

        <div className="dish-grid">
          {dishes.map((dish) => (
            <Link href="#contact" key={dish.id} className="dish-card" aria-label={`${dish.name}, ${dish.price}`}>
              <Image src={dish.image} alt={dish.name} fill sizes="(max-width: 800px) 84vw, 25vw" className="cover-image" />
              <span className="dish-card__shade" />
              <div className="dish-card__content">
                <span className="dish-card__index">{dish.index} · {dish.price}</span>
                <h3>{dish.name}</h3>
                <p>{dish.description}</p>
              </div>
              <span className="dish-card__action"><ArrowUpRight size={15} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section id="experience" className="section-shell proof-section">
        <div className="section-intro section-intro--compact">
          <div>
            <SectionLabel number="03">Le goût en deux temps</SectionLabel>
            <h2>Généreux de loin.<br />Précis de près.</h2>
          </div>
          <p>Un plat sénégalais se découvre d’abord dans son ensemble, puis dans les détails de cuisson, de sauce et de texture.</p>
        </div>
        <div className="proof-pair">
          <figure className="proof-panel">
            <Image src="/images/hero-teranga.png" alt="Le ceebu jën présenté comme un plat à partager" fill sizes="(max-width: 800px) 100vw, 50vw" className="cover-image" />
            <figcaption><span>01</span><strong>Le plat à partager</strong><small>La générosité du service</small></figcaption>
          </figure>
          <span className="proof-pair__badge" aria-hidden="true"><ArrowRight size={17} /></span>
          <figure className="proof-panel">
            <Image src="/images/yassa.png" alt="Détail d’un yassa poulet aux oignons fondants" fill sizes="(max-width: 800px) 100vw, 50vw" className="cover-image" />
            <figcaption><span>02</span><strong>Le détail qui compte</strong><small>La texture, le feu, la sauce</small></figcaption>
          </figure>
        </div>
        <p className="image-note">Images d’ambiance créées pour cette proposition — photographies définitives de la maison à confirmer.</p>
      </section>

      <section className="process-section">
        <div className="section-shell">
          <SectionLabel number="04" aside="Simple, du plat au panier">Votre commande</SectionLabel>
          <div className="process-grid">
            <div className="process-copy">
              <p className="eyebrow">À votre rythme</p>
              <h2>Votre repas,<br />en quatre gestes.</h2>
              <p>La carte donne envie. Le parcours fait le reste, de la sélection jusqu’au suivi de la préparation.</p>
              <Link href="#contact"><ArrowButton light>Contacter la maison</ArrowButton></Link>
            </div>
            <ol className="steps-list">
              {steps.map(([index, title, description]) => (
                <li key={index}>
                  <span className="step-index">{index}</span>
                  <span><strong>{title}</strong><small>{description}</small></span>
                  <ArrowUpRight size={19} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="maison" className="section-shell about-section">
        <SectionLabel number="05" aside="La maison">Derrière l’assiette</SectionLabel>
        <div className="about-grid">
          <div className="about-image">
            <Image src="/images/chef.png" alt="Chef sénégalais terminant le dressage d’un plat en cuisine" fill sizes="(max-width: 800px) 100vw, 55vw" className="cover-image" />
          </div>
          <div className="about-copy">
            <p className="eyebrow eyebrow--dark">Le geste avant le décor</p>
            <h2>Une cuisine d’ici, servie maintenant.</h2>
            <p>Le concept Kër Ndar met les recettes sénégalaises au premier plan, dans une expérience directe, visuelle et facile à commander. Le nom, le lieu précis et l’identité de l’équipe restent personnalisables avec vos informations réelles.</p>
            <div className="fact-grid">
              <div><span>La carte</span><strong>Recettes sénégalaises</strong></div>
              <div><span>Le service</span><strong>Détails à confirmer</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="human-proof">
        <Image src="/images/chef.png" alt="Geste du chef dans une cuisine chaleureuse" fill sizes="100vw" className="cover-image" />
        <div className="human-proof__veil" />
        <div className="quote-card">
          <span className="quote-mark" aria-hidden="true">“</span>
          <blockquote>Nous voulons que chaque plat retrouve le goût du partage, même lorsqu’il arrive dans une seule assiette.</blockquote>
          <p>Principe de la maison · proposition éditoriale</p>
          <Link href="#contact"><ArrowButton>Contacter la maison</ArrowButton></Link>
        </div>
      </section>

      <section id="questions" className="section-shell faq-section">
        <SectionLabel number="06" aside="Avant de commander">Questions fréquentes</SectionLabel>
        <div className="faq-grid">
          <div>
            <p className="eyebrow eyebrow--dark">Tout est clair</p>
            <h2>Les réponses<br />avant la faim.</h2>
          </div>
          <div className="accordion">
            {faqs.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <div className={`faq-item ${isOpen ? "is-open" : ""}`} key={item.question}>
                  <button onClick={() => setOpenFaq(isOpen ? -1 : index)} aria-expanded={isOpen} aria-controls={`faq-answer-${index}`}>
                    <span>{item.question}</span><ChevronDown size={18} />
                  </button>
                  <div id={`faq-answer-${index}`} className="faq-answer" aria-hidden={!isOpen}><p>{item.answer}</p></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="contact" className="final-cta">
        <Image src="/images/hero-teranga.png" alt="Table sénégalaise prête à accueillir les convives" fill sizes="100vw" className="cover-image" />
        <div className="final-cta__veil" />
        <div className="final-cta__content">
          <p className="eyebrow">La table est prête</p>
          <h2>Choisissez ce qui<br />vous fait envie.</h2>
          <div className="final-cta__actions">
            <Link href="#contact"><ArrowButton light>Contacter la maison</ArrowButton></Link>
            <a href="#footer-contact" className="text-link text-link--light">Voir les informations <ArrowDown size={15} /></a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="section-shell">
          <div className="footer-grid">
            <div className="footer-brand">
              <Link href="#top" className="brand-mark brand-mark--footer"><span>Kër</span><span>Ndar</span></Link>
              <p>Les grandes recettes sénégalaises,<br />servies avec simplicité.</p>
            </div>
            <div id="footer-contact" className="contact-card">
              <span>Informations pratiques</span>
              <h3>Adresse et horaires<br />à confirmer.</h3>
              <div><MapPin size={17} /><p>Dakar, Sénégal<br /><small>Localisation précise à renseigner</small></p></div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Kër Ndar — concept de démonstration</span>
            <div><Link href="#carte">La carte</Link><Link href="#questions">Questions</Link><Link href="#top">Retour en haut</Link></div>
          </div>
        </div>
      </footer>
    </main>
  );
}
