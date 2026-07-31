"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Heart,
  Handshake,
  LogIn,
  MapPin,
  Menu,
  MessageCircle,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { SunuShopLogo } from "./sunushop-logo";

const navItems = [
  { href: "#services", label: "Services" },
  { href: "#espaces", label: "Espaces" },
  { href: "#fonctionnement", label: "Fonctionnement" },
  { href: "#identite", label: "Notre identité" },
  { href: "#questions", label: "Questions" },
];

const questions = [
  {
    question: "SunuShop est-il déjà disponible partout au Sénégal ?",
    answer:
      "La couverture dépend des zones de livraison définies par chaque marchand. Le prix et le délai sont affichés avant la confirmation de la commande.",
  },
  {
    question: "Comment SunuShop vérifie les vendeurs ?",
    answer:
      "Les marchands transmettent les informations et documents nécessaires à leur vérification. Leur statut est visible dans la boutique avant l’achat.",
  },
  {
    question: "Combien coûte l’utilisation pour un marchand ?",
    answer:
      "La V1 prévoit un essai accompagné de 30 jours, puis des abonnements mensuels. Les tarifs définitifs seront validés avec les premiers marchands pilotes.",
  },
  {
    question: "SunuShop prend-il une commission sur les ventes ?",
    answer:
      "La V1 est conçue sans commission sur les ventes. Le modèle repose sur un abonnement marchand prévisible.",
  },
  {
    question: "Puis-je suivre une commande après l’achat ?",
    answer:
      "Oui. Chaque commande dispose d’un statut horodaté, du traitement par le vendeur jusqu’à la réception.",
  },
];

function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="ss-header">
      <div className="ss-shell ss-header__inner">
        <Link href="#top" aria-label="SunuShop, retour en haut" onClick={() => setOpen(false)}>
          <SunuShopLogo />
        </Link>

        <nav className="ss-nav" aria-label="Navigation principale">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ss-header__actions">
          <Link
            href="/connexion?profil=client&next=/client"
            className="ss-header__login"
          >
            <LogIn />
            Connexion
          </Link>
          <Link href="/marche" className="ss-header__cta">
            Ouvrir le marché
            <ArrowUpRight />
          </Link>
        </div>

        <button
          className="ss-menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="ss-mobile-nav"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      <nav
        id="ss-mobile-nav"
        className={`ss-mobile-nav ${open ? "is-open" : ""}`}
        aria-label="Navigation mobile"
      >
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
            <ChevronRight />
          </Link>
        ))}
        <Link
          href="/connexion?profil=client&next=/client"
          className="ss-mobile-nav__login"
          onClick={() => setOpen(false)}
        >
          Se connecter
          <LogIn />
        </Link>
        <Link href="/marche" className="ss-mobile-nav__cta" onClick={() => setOpen(false)}>
          Ouvrir le marché
          <ArrowUpRight />
        </Link>
      </nav>
    </header>
  );
}

function Phone({
  variant,
  className = "",
}: {
  variant: "market" | "merchant" | "tracking";
  className?: string;
}) {
  return (
    <div className={`ss-phone ss-phone--${variant} ${className}`}>
      <div className="ss-phone__top">
        <span>9:41</span>
        <i aria-hidden="true" />
        <span className="ss-phone__signal">5G</span>
      </div>

      {variant === "market" && (
        <div className="ss-phone__screen ss-market-screen">
          <div className="ss-app-heading">
            <SunuShopLogo compact />
            <button type="button" aria-label="Ouvrir le panier">
              <ShoppingBag />
              <i>2</i>
            </button>
          </div>
          <div className="ss-app-welcome">
            <span>Bonjour Aïssatou</span>
            <strong>Qu’est-ce qu’il te faut aujourd’hui ?</strong>
          </div>
          <div className="ss-app-search">
            <Search />
            <span>Rechercher un produit</span>
          </div>
          <div className="ss-app-chips">
            <span className="is-active">Pour toi</span>
            <span>Mode</span>
            <span>Maison</span>
          </div>
          <div className="ss-app-feature">
            <Image
              src="/images/wax-shirt-product.png"
              alt="Chemise en wax présentée dans SunuShop"
              width={420}
              height={300}
              priority
            />
            <div>
              <small>Maison Awa</small>
              <strong>La pièce qui donne le ton.</strong>
              <span>18 500 F CFA</span>
            </div>
          </div>
          <div className="ss-app-section-title">
            <strong>Boutiques près de toi</strong>
            <span>Tout voir</span>
          </div>
          <div className="ss-mini-products">
            <div>
              <Image
                src="/images/electronics-bundle.png"
                alt=""
                width={160}
                height={120}
              />
              <b>Tech Dakar</b>
            </div>
            <div>
              <Image
                src="/images/vegetable-basket.png"
                alt=""
                width={160}
                height={120}
              />
              <b>Marché frais</b>
            </div>
          </div>
          <div className="ss-app-bottom-nav">
            <span className="is-active"><Store /></span>
            <span><Search /></span>
            <span><Heart /></span>
            <span><ShoppingBag /></span>
          </div>
        </div>
      )}

      {variant === "merchant" && (
        <div className="ss-phone__screen ss-merchant-screen">
          <div className="ss-app-heading">
            <div>
              <small>Espace marchand</small>
              <strong>Maison Awa</strong>
            </div>
            <span className="ss-verified"><BadgeCheck /></span>
          </div>
          <div className="ss-merchant-hero">
            <span>Aujourd’hui</span>
            <strong>Des commandes nettes.<br />Du temps retrouvé.</strong>
            <div className="ss-zero-pill">0 % de commission en V1</div>
          </div>
          <div className="ss-metric-row">
            <div><PackageCheck /><span>À préparer</span><b>4</b></div>
            <div><MessageCircle /><span>Messages</span><b>2</b></div>
          </div>
          <div className="ss-order-list">
            <div className="ss-app-section-title">
              <strong>Commandes récentes</strong>
              <span>Voir tout</span>
            </div>
            <div className="ss-order-row">
              <span className="ss-order-image">
                <Image src="/images/cotton-outfit-product.png" alt="" width={80} height={80} />
              </span>
              <span><b>#SS-0184</b><small>Tenue coton · M</small></span>
              <i>Confirmée</i>
            </div>
            <div className="ss-order-row">
              <span className="ss-order-image">
                <Image src="/images/electronics-bundle.png" alt="" width={80} height={80} />
              </span>
              <span><b>#SS-0183</b><small>Casque audio</small></span>
              <i>À traiter</i>
            </div>
          </div>
          <div className="ss-app-bottom-nav">
            <span className="is-active"><BarChart3 /></span>
            <span><PackageCheck /></span>
            <span><Store /></span>
            <span><MessageCircle /></span>
          </div>
        </div>
      )}

      {variant === "tracking" && (
        <div className="ss-phone__screen ss-tracking-screen">
          <div className="ss-app-heading">
            <button type="button" aria-label="Retour">
              <ArrowRight className="ss-rotate-icon" />
            </button>
            <strong>Suivi de commande</strong>
            <span />
          </div>
          <div className="ss-tracking-visual">
            <span><Truck /></span>
            <small>Commande #SS-0184</small>
            <strong>En route vers toi</strong>
            <p>Arrivée estimée entre 16h et 18h</p>
          </div>
          <div className="ss-tracking-map">
            <span className="ss-map-road ss-map-road--one" />
            <span className="ss-map-road ss-map-road--two" />
            <span className="ss-map-dot"><MapPin /></span>
            <span className="ss-map-shop"><Store /></span>
          </div>
          <div className="ss-timeline">
            <div className="is-done"><i><Check /></i><span><b>Commande confirmée</b><small>Aujourd’hui · 10:12</small></span></div>
            <div className="is-done"><i><Check /></i><span><b>Préparée par le vendeur</b><small>Aujourd’hui · 12:45</small></span></div>
            <div className="is-current"><i><Truck /></i><span><b>En cours de livraison</b><small>Mise à jour il y a 8 min</small></span></div>
            <div><i /><span><b>Commande reçue</b><small>À confirmer</small></span></div>
          </div>
          <button className="ss-contact-button" type="button">
            <MessageCircle />
            Contacter le vendeur
          </button>
        </div>
      )}
    </div>
  );
}

function Hero() {
  return (
    <section className="ss-hero ss-shell" id="top">
      <div className="ss-hero__copy">
        <div className="ss-eyebrow">
          <span className="ss-eyebrow__avatars" aria-hidden="true">
            <i>A</i><i>M</i><i>F</i>
          </span>
          Pensé pour celles et ceux qui font vivre le commerce local
        </div>
        <h1>
          Vendez simplement.<br />
          Commandez l’esprit <span>clair.</span>
        </h1>
        <p>
          SunuShop transforme les catalogues partagés sur les réseaux en boutiques
          vérifiées, avec un prix total visible et chaque commande suivie jusqu’à la réception.
        </p>
        <div className="ss-hero__actions">
          <Link href="/marche" className="ss-button ss-button--primary">
            Ouvrir le marché
            <span><ArrowUpRight /></span>
          </Link>
          <Link href="#services" className="ss-button ss-button--secondary">
            Voir les services
            <ArrowDown />
          </Link>
        </div>
        <div className="ss-hero__reassurance">
          <span><BadgeCheck /> Vendeurs identifiés</span>
          <span><CircleDollarSign /> Total affiché avant confirmation</span>
          <span><PackageCheck /> Suivi horodaté</span>
        </div>
      </div>

      <div className="ss-device-stage" aria-label="Aperçu des expériences SunuShop">
        <span className="ss-device-stage__orbit" aria-hidden="true" />
        <span className="ss-device-stage__stamp" aria-hidden="true">
          <b>SUNU</b>
          <i>COMMANDE CLAIRE</i>
        </span>
        <Phone variant="merchant" className="ss-device--left" />
        <Phone variant="market" className="ss-device--center" />
        <Phone variant="tracking" className="ss-device--right" />
      </div>

      <div className="ss-feature-strip" aria-label="Points forts">
        <span><ShieldCheck /> Boutiques vérifiées</span>
        <span><ShoppingBag /> Catalogue multi-vendeur</span>
        <span><Truck /> Livraison par zone</span>
        <span><MessageCircle /> Messagerie directe</span>
        <span><Store /> Espace marchand</span>
      </div>
    </section>
  );
}

function Identity() {
  return (
    <section className="ss-identity ss-shell" id="identite">
      <div className="ss-section-mark">
        <span>01</span>
        <i />
        <span>Notre identité</span>
      </div>
      <div className="ss-identity__headline">
        <h2>
          Le commerce local mérite une expérience aussi <em>claire</em> que chaleureuse.
        </h2>
        <p>
          « Sunu » signifie « notre ». Notre identité rassemble la confiance d’un
          marché de quartier et la précision d’un outil numérique bien pensé.
        </p>
      </div>
      <div className="ss-identity__grid">
        <div className="ss-brand-card">
          <span className="ss-brand-card__halo" aria-hidden="true" />
          <SunuShopLogo />
          <p>Notre marché. Nos boutiques. Nos commandes.</p>
          <div className="ss-brand-colors" aria-label="Couleurs de la marque">
            <span style={{ background: "#173F2E" }}>Vert Sunu</span>
            <span style={{ background: "#B84D2D" }}>Terre</span>
            <span style={{ background: "#F1AD32", color: "#17231D" }}>Safran</span>
          </div>
        </div>
        <div className="ss-principles">
          <article>
            <span>01</span>
            <div>
              <h3>Proche, jamais flou</h3>
              <p>Le vendeur, le produit, le total et le délai sont explicités avant l’achat.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Local, sans folklore</h3>
              <p>Une identité sénégalaise contemporaine, portée par les produits et les usages réels.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Simple des deux côtés</h3>
              <p>Une expérience claire pour l’acheteur et un outil direct pour le marchand.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function AccessSpaces() {
  const spaces = [
    {
      key: "client",
      eyebrow: "Pour acheter",
      title: "Espace client",
      description:
        "Retrouve tes commandes, poursuis un suivi et accède rapidement aux boutiques qui comptent pour toi.",
      details: ["Mes commandes", "Suivi centralisé", "Boutiques accessibles"],
      href: "/connexion?profil=client&next=/client",
      cta: "Connexion client",
      icon: <UserRound />,
    },
    {
      key: "seller",
      eyebrow: "Pour vendre",
      title: "Espace vendeur",
      description:
        "Gère ta boutique, ton catalogue, tes stocks et les commandes reçues depuis tes réseaux.",
      details: ["Catalogue marchand", "Commandes structurées", "Zones de livraison"],
      href: "/connexion?profil=vendeur&next=/marchand",
      cta: "Connexion vendeur",
      icon: <Store />,
    },
    {
      key: "partner",
      eyebrow: "Pour collaborer",
      title: "Espace partenaire",
      description:
        "Un point d’entrée pour les partenaires de livraison, de paiement et d’opérations SunuShop.",
      details: ["Missions partagées", "Coordination locale", "Accès contrôlé"],
      href: "/connexion?profil=partenaire&next=/partenaires",
      cta: "Connexion partenaire",
      icon: <Handshake />,
    },
  ];

  return (
    <section className="ss-access ss-shell" id="espaces">
      <div className="ss-section-mark">
        <span>02</span>
        <i />
        <span>Choisir mon espace</span>
      </div>
      <div className="ss-access__heading">
        <h2>À chacun son espace. À tous la même clarté.</h2>
        <p>
          Choisis ton profil pour arriver directement dans le parcours qui te
          concerne. La connexion utilise ton email et un mot de passe sécurisé.
        </p>
      </div>
      <div className="ss-access__grid">
        {spaces.map((space) => (
          <article
            className={`ss-access-card ss-access-card--${space.key}`}
            key={space.key}
          >
            <div className="ss-access-card__top">
              <span className="ss-access-card__icon">{space.icon}</span>
              <span className="ss-access-card__eyebrow">{space.eyebrow}</span>
            </div>
            <h3>{space.title}</h3>
            <p>{space.description}</p>
            <ul>
              {space.details.map((detail) => (
                <li key={detail}><Check /> {detail}</li>
              ))}
            </ul>
            <Link href={space.href}>
              <LogIn />
              {space.cta}
              <ArrowUpRight />
            </Link>
          </article>
        ))}
      </div>
      <p className="ss-access__note">
        <ShieldCheck />
        Email confirmé, mot de passe protégé et récupération sécurisée via
        Resend.
      </p>
    </section>
  );
}

function Services() {
  return (
    <section className="ss-services" id="services">
      <div className="ss-shell">
        <div className="ss-section-mark ss-section-mark--light">
          <span>02</span>
          <i />
          <span>Nos services</span>
        </div>
        <div className="ss-services__intro">
          <h2>Une seule place pour acheter, vendre et garder le fil.</h2>
          <p>
            SunuShop relie les moments qui comptent, sans demander aux marchands
            d’abandonner les réseaux où leurs clients les connaissent déjà.
          </p>
        </div>
        <div className="ss-services__grid">
          <article className="ss-service-card ss-service-card--buyer">
            <div className="ss-service-card__copy">
              <span className="ss-card-index">01 · Acheter</span>
              <h3>Trouve la bonne boutique. Vois le vrai total.</h3>
              <p>Produits, variantes, stock, livraison et délai réunis avant la confirmation.</p>
              <Link href="/marche">Explorer le marché <ArrowUpRight /></Link>
            </div>
            <div className="ss-buyer-preview">
              <div>
                <Image src="/images/ready-to-wear-collection.png" alt="" width={420} height={300} />
                <span><b>Collection Teranga</b><small>À partir de 12 500 F CFA</small></span>
              </div>
              <div>
                <Image src="/images/hardware-store-products.png" alt="" width={420} height={300} />
                <span><b>Maison & outils</b><small>Stocks confirmés</small></span>
              </div>
            </div>
          </article>

          <article className="ss-service-card ss-service-card--merchant">
            <div className="ss-service-card__icon"><Store /></div>
            <span className="ss-card-index">02 · Vendre</span>
            <h3>Transforme ton catalogue social en boutique suivie.</h3>
            <p>Partage un lien, organise tes commandes et garde tes zones de livraison sous contrôle.</p>
            <div className="ss-plan-note">
              <span><b>30 jours</b><small>d’essai accompagné</small></span>
              <span><b>0 %</b><small>de commission en V1</small></span>
            </div>
            <Link href="/marchand">Créer ma boutique <ArrowUpRight /></Link>
          </article>

          <article className="ss-service-card ss-service-card--tracking">
            <div className="ss-service-card__icon"><PackageCheck /></div>
            <span className="ss-card-index">03 · Suivre</span>
            <h3>Chaque étape laisse une trace claire.</h3>
            <p>Confirmation, préparation, livraison et réception : le même statut pour tout le monde.</p>
            <div className="ss-mini-timeline" aria-hidden="true">
              <span className="is-done"><i><Check /></i><b>Confirmée</b></span>
              <span className="is-done"><i><Check /></i><b>Préparée</b></span>
              <span className="is-current"><i><Truck /></i><b>En route</b></span>
              <span><i /><b>Reçue</b></span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Choisis ta boutique",
      body: "Le profil marchand, sa zone et son statut sont visibles avant de commander.",
      icon: <Store />,
    },
    {
      number: "02",
      title: "Confirme le total",
      body: "Produit, variante, livraison et délai sont réunis dans une commande claire.",
      icon: <ShoppingBag />,
    },
    {
      number: "03",
      title: "Suis chaque étape",
      body: "Le vendeur et l’acheteur partagent le même historique jusqu’à la réception.",
      icon: <PackageCheck />,
    },
  ];

  return (
    <section className="ss-process ss-shell" id="fonctionnement">
      <div className="ss-section-mark">
        <span>03</span>
        <i />
        <span>Comment ça marche</span>
      </div>
      <div className="ss-process__heading">
        <h2>De la publication à la réception, sans perdre le fil.</h2>
        <p>
          Une progression simple, pensée pour les usages mobile et les échanges
          qui commencent souvent sur WhatsApp, Instagram, Facebook ou TikTok.
        </p>
      </div>
      <ol className="ss-steps">
        {steps.map((step) => (
          <li key={step.number}>
            <span className="ss-steps__number">{step.number}</span>
            <span className="ss-steps__icon">{step.icon}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
            <ChevronRight />
          </li>
        ))}
      </ol>
      <div className="ss-process__actions">
        <Link href="/marche" className="ss-button ss-button--primary">
          Tester le parcours
          <span><ArrowUpRight /></span>
        </Link>
        <span><Clock3 /> Quelques minutes pour comprendre l’essentiel</span>
      </div>
    </section>
  );
}

function AppShowcase() {
  return (
    <section className="ss-showcase">
      <div className="ss-shell ss-showcase__inner">
        <div className="ss-showcase__copy">
          <div className="ss-section-mark ss-section-mark--light">
            <span>04</span>
            <i />
            <span>L’application</span>
          </div>
          <h2>Trois vues.<br />Une même vérité.</h2>
          <p>
            L’acheteur, le marchand et la livraison s’appuient sur la même
            commande. Moins de messages perdus, moins d’interprétations.
          </p>
          <ul>
            <li><Check /> Catalogue structuré</li>
            <li><Check /> Commandes centralisées</li>
            <li><Check /> Statuts partagés</li>
          </ul>
          <Link href="/connexion" className="ss-button ss-button--sun">
            Accéder à mon espace
            <span><ArrowUpRight /></span>
          </Link>
        </div>
        <div className="ss-showcase__device">
          <span className="ss-showcase__ring" aria-hidden="true" />
          <Phone variant="tracking" />
          <div className="ss-floating-proof ss-floating-proof--top">
            <span><BadgeCheck /></span>
            <div><b>Vendeur vérifié</b><small>Identité contrôlée</small></div>
          </div>
          <div className="ss-floating-proof ss-floating-proof--bottom">
            <span><PackageCheck /></span>
            <div><b>Statut mis à jour</b><small>Il y a quelques minutes</small></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section className="ss-faq ss-shell" id="questions">
      <div className="ss-faq__intro">
        <div className="ss-section-mark">
          <span>05</span>
          <i />
          <span>Questions fréquentes</span>
        </div>
        <h2>Des réponses nettes, avant de te lancer.</h2>
        <p>Une autre question sur le projet, les zones ou l’espace marchand ?</p>
        <a href="mailto:bonjour@sunushop.sn" className="ss-button ss-button--secondary">
          Écrire à SunuShop
          <MessageCircle />
        </a>
      </div>
      <div className="ss-faq__list">
        {questions.map((item, index) => (
          <details key={item.question} open={index === 0}>
            <summary>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{item.question}</b>
              <i><X /></i>
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="ss-final ss-shell">
      <div className="ss-final__copy">
        <SunuShopLogo />
        <span className="ss-final__eyebrow">Le commerce local, mieux relié</span>
        <h2>Ta prochaine commande peut déjà être plus claire.</h2>
        <p>
          Explore le marché ou prépare ta boutique pour participer aux premiers parcours SunuShop.
        </p>
        <div>
          <Link href="/marche" className="ss-button ss-button--sun">
            Ouvrir le marché
            <span><ArrowUpRight /></span>
          </Link>
          <Link href="/marchand" className="ss-button ss-button--dark-outline">
            Devenir marchand
          </Link>
        </div>
      </div>
      <div className="ss-final__visual" aria-hidden="true">
        <span className="ss-final__sun" />
        <Phone variant="market" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="ss-footer">
      <div className="ss-shell ss-footer__main">
        <div className="ss-footer__brand">
          <SunuShopLogo />
          <p>La marketplace qui rend chaque commande claire, du vendeur à la réception.</p>
          <span><MapPin /> Dakar · Sénégal</span>
        </div>
        <div>
          <h3>Acheter</h3>
          <Link href="/marche">Le marché</Link>
          <Link href="#services">Nos services</Link>
          <Link href="#questions">Questions</Link>
        </div>
        <div>
          <h3>Vendre</h3>
          <Link href="/marchand">Espace marchand</Link>
          <Link href="/connexion">Se connecter</Link>
          <a href="mailto:bonjour@sunushop.sn">Nous contacter</a>
        </div>
        <div className="ss-footer__note">
          <span>Projet SunuShop</span>
          <p>Une expérience web pensée d’abord pour le mobile et le commerce sénégalais.</p>
          <Link href="#top">Retour en haut <ArrowUpRight /></Link>
        </div>
      </div>
      <div className="ss-shell ss-footer__bottom">
        <span>© 2026 SunuShop. Tous droits réservés.</span>
        <div><Link href="#questions">Confidentialité</Link><Link href="#questions">Conditions</Link></div>
      </div>
    </footer>
  );
}

export function SunuShopLanding() {
  return (
    <div className="ss-page">
      <Header />
      <main>
        <Hero />
        <Identity />
        <AccessSpaces />
        <Services />
        <HowItWorks />
        <AppShowcase />
        <Questions />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
