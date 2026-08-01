"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  Headphones,
  Heart,
  History,
  Home,
  LocateFixed,
  LockKeyhole,
  LogIn,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Package,
  PackageCheck,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Truck,
  UserRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { FaqAccordion } from "./faq-accordion";
import {
  CATEGORIES,
  DELIVERY_OPTIONS,
  FAQS,
  formatPrice,
  MERCHANTS,
  PRODUCTS,
} from "@/lib/marketplace";
import type { Category, DeliveryMode, Product, View } from "@/lib/marketplace";

function Stars({ value = 5 }: { value?: number }) {
  return (
    <span className="stars" aria-label={`${value} étoiles sur 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={13} fill={index < Math.round(value) ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`app-logo ${compact ? "app-logo--compact" : ""}`}>
      <span className="logo-sun" aria-hidden="true"><ShoppingBasket size={18} /></span>
      <span>Sunu<span>Shop</span></span>
    </span>
  );
}

function ProductCard({
  product,
  onAdd,
  onMessage,
}: {
  product: Product;
  onAdd: (product: Product) => void;
  onMessage: (merchant: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  return (
    <article className="product-card">
      <div className="product-media">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 600px) 78vw, (max-width: 1000px) 42vw, 260px"
        />
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <button
          className={`like-button ${liked ? "is-liked" : ""}`}
          onClick={() => setLiked(!liked)}
          aria-label={liked ? `Retirer ${product.name} des favoris` : `Ajouter ${product.name} aux favoris`}
        >
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="product-copy">
        <button className="merchant-link" onClick={() => onMessage(product.merchant)}>
          {product.merchant} <MessageCircle size={12} />
        </button>
        <h3>{product.name}</h3>
        <div className="rating-line">
          <Stars value={product.rating} />
          <span>{product.rating.toFixed(1)} · {product.reviews}</span>
        </div>
        <div className="product-bottom">
          <div className="price">
            <strong>{formatPrice(product.price)}</strong>
            {product.oldPrice && <del>{formatPrice(product.oldPrice)}</del>}
          </div>
          <button className="add-button" onClick={() => onAdd(product)} aria-label={`Ajouter ${product.name} au panier`}>
            <Plus size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}

function StoreHeader({
  view,
  setView,
  cartCount,
  openCart,
  search,
  setSearch,
}: {
  view: View;
  setView: (view: View) => void;
  cartCount: number;
  openCart: () => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (next: View) => {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="store-header">
      <div className="store-header__main app-shell">
        <button onClick={() => go("home")} className="logo-button" aria-label="Accueil SunuShop">
          <AppLogo />
        </button>

        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Rechercher un produit ou un marchand</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un produit, une boutique..."
          />
          <kbd>⌘ K</kbd>
        </label>

        <nav className="header-actions" aria-label="Actions principales">
          <button onClick={() => go("tracking")} className={view === "tracking" ? "is-active" : ""}>
            <LocateFixed size={19} /><span>Suivi</span>
          </button>
          <button onClick={() => go("messages")} className={view === "messages" ? "is-active" : ""}>
            <MessageCircle size={19} /><span>Messages</span><i>2</i>
          </button>
          <button onClick={() => go("profile")} className={view === "profile" ? "is-active" : ""}>
            <UserRound size={19} /><span>Compte</span>
          </button>
          <button onClick={openCart} className="cart-header-button">
            <ShoppingBag size={19} /><span>Panier</span>{cartCount > 0 && <b>{cartCount}</b>}
          </button>
        </nav>

        <button
          className="menu-toggle"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>

      <div className="store-header__nav">
        <div className="app-shell category-nav">
          <button className="all-category"><Menu size={15} /> Toutes les catégories</button>
          <button onClick={() => window.location.assign("/marche")}>Boutiques vérifiées</button>
          <button onClick={() => go("home")}>Mode</button>
          <button onClick={() => go("home")}>Électronique</button>
          <button onClick={() => go("home")}>Marché frais</button>
          <span />
          <button onClick={() => window.location.assign("/marchand")} className="merchant-entry"><Store size={15} /> Espace marchand</button>
        </div>
      </div>

      {menuOpen && (
        <div className="mobile-menu">
          <label className="search-box search-box--mobile">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher..." />
          </label>
          <button onClick={() => go("home")}><Home size={18} /> Boutique</button>
          <button onClick={() => go("tracking")}><LocateFixed size={18} /> Suivre ma livraison</button>
          <button onClick={() => go("messages")}><MessageCircle size={18} /> Mes messages</button>
          <button onClick={() => go("profile")}><UserRound size={18} /> Mon profil</button>
          <button onClick={() => window.location.assign("/marchand")}><Store size={18} /> Espace marchand</button>
          <button onClick={() => { openCart(); setMenuOpen(false); }}><ShoppingBag size={18} /> Panier ({cartCount})</button>
        </div>
      )}
    </header>
  );
}

function Storefront({
  onAdd,
  onMessage,
  onTrack,
  search,
  setSearch,
}: {
  onAdd: (product: Product) => void;
  onMessage: (merchant: string) => void;
  onTrack: () => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<Category>("Tout");
  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("fr");
    return PRODUCTS.filter((product) => {
      const matchesCategory = activeCategory === "Tout" || activeCategory === "Commerçants" || product.category === activeCategory;
      const matchesSearch =
        !normalized ||
        `${product.name} ${product.category} ${product.merchant}`.toLocaleLowerCase("fr").includes(normalized);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  const chooseCategory = (category: Category) => {
    setActiveCategory(category);
    setSearch("");
    document.getElementById("produits")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main>
      <section className="hero-shop app-shell">
        <div className="hero-shop__copy">
          <span className="eyebrow-pill"><Sparkles size={13} /> Vendeur · prix · délai · suivi</span>
          <h1>Vous savez avant<br /><em>de payer.</em></h1>
          <p>Qui vend, combien vous payez, quand la commande arrive et où elle en est. SunuShop rend chaque achat clair, partout au Sénégal.</p>
          <div className="hero-buttons">
            <button className="primary-button" onClick={() => window.location.assign("/marche")}>
              Ouvrir le marché pilote <ArrowRight size={17} />
            </button>
            <button className="secondary-button" onClick={onTrack}>
              <LocateFixed size={17} /> Suivre une commande
            </button>
          </div>
          <div className="hero-social-proof">
            <span className="avatar-stack"><i>AM</i><i>FS</i><i>ND</i></span>
            <span><Stars value={5} /><small>Expérience de démonstration</small></span>
          </div>
        </div>
        <div className="hero-shop__visual">
          <Image
            src="/images/market-hero.png"
            alt="Sélection de produits vendus sur SunuShop"
            fill
            priority
            sizes="(max-width: 800px) 100vw, 55vw"
          />
          <span className="floating-tag floating-tag--top"><PackageCheck size={18} /><b>Stock confirmé</b><small>Vendeur identifié</small></span>
          <span className="floating-tag floating-tag--bottom"><Truck size={18} /><b>Délai annoncé</b><small>Statut visible · Démo</small></span>
        </div>
      </section>

      <section className="trust-band app-shell" aria-label="Avantages">
        <div><Truck /><span><b>Délai par zone</b><small>Avant la confirmation</small></span></div>
        <div><ShieldCheck /><span><b>Prix total visible</b><small>Produit et livraison</small></span></div>
        <div><PackageCheck /><span><b>Marchands vérifiés</b><small>Identité et boutique</small></span></div>
        <div><Headphones /><span><b>Commande suivie</b><small>Chaque étape horodatée</small></span></div>
      </section>

      <section className="promo-banner app-shell">
        <div className="promo-icon"><ShoppingBag /></div>
        <div><span>OFFRE DE BIENVENUE · DÉMO</span><h2>Livraison offerte</h2><p>sur votre première commande</p></div>
        <div className="promo-code"><small>UTILISEZ LE CODE</small><strong>TERANGA</strong></div>
        <span className="promo-confetti" aria-hidden="true">✦</span>
      </section>

      <section className="category-section app-shell" id="categories">
        <div className="section-heading">
          <div><span>ACHETEZ PAR UNIVERS</span><h2>Tout ce qu’il vous faut,<br />près de chez vous.</h2></div>
          <p>Quatre univers, des vendeurs identifiables et une expérience pensée pour acheter sans hésiter.</p>
        </div>
        <div className="category-grid">
          {CATEGORIES.map((category, index) => (
            <button key={category.name} className={`category-card category-card--${category.tone}`} onClick={() => chooseCategory(category.name)}>
              <Image src={category.image} alt="" fill sizes="(max-width: 800px) 84vw, 25vw" />
              <span className="category-shade" />
              <span className="category-index">0{index + 1}</span>
              <span className="category-copy"><strong>{category.name}</strong><small>{category.description}</small></span>
              <i><ArrowRight size={17} /></i>
            </button>
          ))}
        </div>
      </section>

      <section className="product-section app-shell" id="produits">
        <div className="product-section__top">
          <div><span>SÉLECTION POUR VOUS</span><h2>{activeCategory === "Tout" ? "Les produits du moment" : activeCategory}</h2></div>
          <div className="filter-row">
            {(["Tout", "Prêt-à-porter", "Électronique", "Alimentaire"] as Category[]).map((category) => (
              <button key={category} className={activeCategory === category ? "is-active" : ""} onClick={() => setActiveCategory(category)}>{category}</button>
            ))}
            <button aria-label="Plus de filtres"><SlidersHorizontal size={16} /></button>
          </div>
        </div>
        {filtered.length > 0 ? (
          <div className="product-grid">
            {filtered.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} onMessage={onMessage} />)}
          </div>
        ) : (
          <div className="empty-search">
            <Search size={30} />
            <h3>Aucun produit trouvé</h3>
            <p>Essayez une autre recherche ou revenez à toutes les catégories.</p>
            <button className="secondary-button" onClick={() => { setSearch(""); setActiveCategory("Tout"); }}>Voir tous les produits</button>
          </div>
        )}
      </section>

      <section className="process-shop">
        <div className="app-shell">
          <div className="process-shop__intro">
            <span>DE L’ENVIE À VOTRE PORTE</span>
            <h2>Commandez.<br />Respirez.<br /><em>On s’occupe du reste.</em></h2>
            <button className="light-button" onClick={onTrack}>Voir le suivi <ArrowRight size={16} /></button>
          </div>
          <ol className="process-steps">
            <li><i>01</i><span><b>Choisissez</b><small>Explorez les produits et les boutiques.</small></span><Search /></li>
            <li><i>02</i><span><b>Payez en sécurité</b><small>Mobile Money ou carte bancaire.</small></span><LockKeyhole /></li>
            <li><i>03</i><span><b>Suivez le livreur</b><small>Recevez chaque changement de statut.</small></span><LocateFixed /></li>
            <li><i>04</i><span><b>Notez l’expérience</b><small>Partagez un avis utile au marchand.</small></span><Star /></li>
          </ol>
        </div>
      </section>

      <section className="merchants-section app-shell" id="marchands">
        <div className="section-heading">
          <div><span>LES VISAGES DU MARCHÉ</span><h2>Des boutiques que<br />vous pouvez connaître.</h2></div>
          <p>Chaque marchand dispose d’un profil, d’une messagerie et d’un espace d’avis. Les données affichées ici sont des exemples de démonstration.</p>
        </div>
        <div className="merchant-grid">
          {MERCHANTS.map((merchant) => (
            <article className="merchant-card" key={merchant.name}>
              <div className="merchant-avatar" style={{ background: merchant.color }}>{merchant.initials}</div>
              <div><small>{merchant.category}</small><h3>{merchant.name}</h3><span><Stars value={Number(merchant.rating.replace(",", "."))} /> {merchant.rating} · {merchant.reviews}</span></div>
              <button onClick={() => onMessage(merchant.name)} aria-label={`Écrire à ${merchant.name}`}><MessageCircle size={17} /></button>
            </article>
          ))}
        </div>
        <div className="review-panel">
          <div className="review-panel__copy">
            <span>VOTRE AVIS COMPTE</span>
            <h2>La confiance se construit commande après commande.</h2>
            <p>Après chaque livraison, notez le produit, le marchand et la qualité de la remise.</p>
          </div>
          <div className="review-quote">
            <Stars value={5} />
            <blockquote>« Le suivi permet de savoir exactement quand se préparer. Et je peux écrire à la boutique sans quitter l’application. »</blockquote>
            <p>Exemple d’avis · contenu de démonstration</p>
            <div className="review-dots"><i /><i /><i /></div>
          </div>
        </div>
      </section>

      <section className="faq-shop app-shell">
        <div className="faq-shop__title">
          <span>AVANT DE COMMANDER</span>
          <h2>Vos questions,<br />répondues clairement.</h2>
          <p>Le prototype distingue les parcours disponibles aujourd’hui des services qui demanderont une infrastructure sécurisée.</p>
        </div>
        <FaqAccordion faqs={FAQS} />
      </section>

      <section className="final-shop-cta app-shell">
        <div>
          <span>COMMENCEZ ICI</span>
          <h2>Votre marché,<br />dans votre poche.</h2>
          <p>Explorez les boutiques, ajoutez vos produits et choisissez votre moyen de paiement préféré.</p>
          <button className="primary-button" onClick={() => document.getElementById("produits")?.scrollIntoView({ behavior: "smooth" })}>Explorer les produits <ArrowRight size={17} /></button>
        </div>
        <div className="phone-mockup" aria-label="Aperçu du suivi mobile">
          <div className="phone-top"><AppLogo compact /><Bell size={16} /></div>
          <small>Bonjour Aïssatou 👋</small>
          <h3>Votre commande arrive.</h3>
          <div className="mini-map"><span className="mini-route" /><i className="mini-bike"><Truck size={15} /></i><b>A</b></div>
          <div className="mini-order"><span><Package size={19} /><i><b>Commande #SM-2048</b><small>Arrivée dans 18 min</small></i></span><ChevronRight size={18} /></div>
        </div>
      </section>
    </main>
  );
}

function TrackingView({ goHome }: { goHome: () => void }) {
  const [notifications, setNotifications] = useState(true);
  const [trackingCode, setTrackingCode] = useState("SM-2048");
  const [trackingMessage, setTrackingMessage] = useState("");
  const findOrder = (event: FormEvent) => {
    event.preventDefault();
    const normalized = trackingCode.trim().toUpperCase();
    setTrackingMessage(
      normalized === "SM-2048"
        ? "Commande trouvée · livraison en cours"
        : "Code introuvable dans cette démonstration. Essayez SM-2048."
    );
  };
  return (
    <main className="app-view app-shell">
      <div className="view-title">
        <div><button className="back-button" onClick={goHome}><ArrowLeft /></button><span><small>COMMANDE EN COURS</small><h1>Suivi de livraison</h1></span></div>
        <button className={`notification-toggle ${notifications ? "is-on" : ""}`} onClick={() => setNotifications(!notifications)}>
          <Bell size={17} /> Notifications {notifications ? "activées" : "désactivées"}<i />
        </button>
      </div>
      <section className="public-tracking" aria-labelledby="public-tracking-title">
        <div>
          <span className="tracking-mark"><PackageCheck /></span>
          <span><small>SUIVI SANS COMPTE</small><h2 id="public-tracking-title">Où est votre commande ?</h2><p>Entrez le code reçu après confirmation. Vous pouvez aussi partager ce suivi avec la personne qui réceptionne.</p></span>
        </div>
        <form onSubmit={findOrder}>
          <label><span className="sr-only">Code de suivi</span><input value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} placeholder="Ex. SM-2048" /></label>
          <button type="submit">Suivre maintenant <ArrowRight /></button>
        </form>
        {trackingMessage && <p className={`tracking-feedback ${trackingMessage.startsWith("Commande") ? "is-success" : ""}`} role="status">{trackingMessage}</p>}
      </section>
      <div className="tracking-grid">
        <section className="tracking-map">
          <div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" />
          <span className="map-label label-one">Mermoz</span><span className="map-label label-two">Sacré-Cœur</span><span className="map-label label-three">VDN</span>
          <div className="map-route" />
          <span className="merchant-pin"><Store size={18} /></span>
          <span className="customer-pin"><MapPin size={18} /></span>
          <span className="courier-pin"><Truck size={19} /></span>
          <button className="recenter-button"><LocateFixed size={18} /> Recentrer</button>
          <div className="eta-card"><Clock3 /><span><small>ARRIVÉE ESTIMÉE</small><strong>18 min</strong><p>Entre 19:32 et 19:38</p></span></div>
        </section>
        <aside className="delivery-panel">
          <div className="delivery-status">
            <span className="status-icon"><Truck /></span>
            <div><small>EN ROUTE VERS VOUS</small><h2>Votre livreur approche</h2><p>La commande a quitté Mermoz il y a 6 minutes.</p></div>
          </div>
          <div className="courier-card">
            <div className="courier-avatar">MD</div>
            <div><b>Moussa Diop</b><small>Livreur partenaire · Démo</small><span><Star size={13} fill="currentColor" /> 4,9</span></div>
            <button aria-label="Appeler Moussa"><Phone /></button>
            <button aria-label="Écrire à Moussa"><MessageCircle /></button>
          </div>
          <ol className="timeline">
            <li className="done"><i><Check /></i><span><b>Commande confirmée</b><small>19:02 · Paiement accepté</small></span></li>
            <li className="done"><i><Check /></i><span><b>Préparation terminée</b><small>19:16 · Marché Frais</small></span></li>
            <li className="active"><i><Truck /></i><span><b>Livraison en cours</b><small>Moussa est en route</small></span></li>
            <li><i><PackageCheck /></i><span><b>Livrée</b><small>Arrivée estimée à 19:35</small></span></li>
          </ol>
          <div className="order-summary-card">
            <div><span><Package size={18} /> Commande #SM-2048</span><b>15 500 F</b></div>
            <p>Panier légumes frais × 1 · Panier Yassa à cuisiner × 1</p>
            <button>Voir le détail <ChevronRight size={15} /></button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function MessagesView({ initialMerchant, goHome }: { initialMerchant: string; goHome: () => void }) {
  const [activeMerchant, setActiveMerchant] = useState(initialMerchant || "Maison Awa");
  const [draft, setDraft] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const conversations = ["Maison Awa", "Marché Frais", "Dakar Tech"];
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSentMessages((items) => [...items, draft.trim()]);
    setDraft("");
  };
  return (
    <main className="app-view app-shell message-page">
      <div className="view-title">
        <div><button className="back-button" onClick={goHome}><ArrowLeft /></button><span><small>ÉCHANGES DIRECTS</small><h1>Messagerie</h1></span></div>
      </div>
      <div className="chat-layout">
        <aside className="conversation-list">
          <div className="conversation-search"><Search size={16} /><input placeholder="Rechercher une discussion" /></div>
          {conversations.map((merchant, index) => (
            <button key={merchant} className={activeMerchant === merchant ? "is-active" : ""} onClick={() => setActiveMerchant(merchant)}>
              <span className="chat-avatar">{merchant.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span>
              <span><b>{merchant}</b><small>{index === 0 ? "Oui, cette taille est disponible." : index === 1 ? "Votre panier est prêt." : "Garantie de 6 mois incluse."}</small></span>
              <i>{index === 0 ? "18:42" : "Hier"}</i>
            </button>
          ))}
        </aside>
        <section className="chat-panel">
          <header><span className="chat-avatar">{activeMerchant.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><b>{activeMerchant}</b><small><i /> En ligne · répond généralement vite</small></div><button><Phone size={18} /></button><button><CircleHelp size={18} /></button></header>
          <div className="chat-product-context"><Image src={activeMerchant === "Dakar Tech" ? "/images/electronics-bundle.png" : activeMerchant === "Marché Frais" ? "/images/vegetable-basket.png" : "/images/fashion-bundle.png"} alt="" width={54} height={54} /><span><small>À PROPOS DE</small><b>{activeMerchant === "Dakar Tech" ? "Casque sans fil" : activeMerchant === "Marché Frais" ? "Panier légumes frais" : "Chemise wax Ndar"}</b></span><button>Voir le produit</button></div>
          <div className="messages">
            <span className="day-divider">AUJOURD’HUI</span>
            <div className="bubble bubble--seller">Bonjour 👋 Comment pouvons-nous vous aider ?<small>18:36</small></div>
            <div className="bubble bubble--me">Bonsoir, est-ce que ce produit est toujours disponible ?<small>18:39 · Lu</small></div>
            <div className="bubble bubble--seller">Oui, il est disponible. La préparation peut commencer dès la commande confirmée.<small>18:42</small></div>
            {sentMessages.map((message, index) => <div className="bubble bubble--me" key={`${message}-${index}`}>{message}<small>À l’instant · Envoyé</small></div>)}
          </div>
          <form className="message-composer" onSubmit={send}>
            <button type="button" aria-label="Ajouter une pièce jointe"><Plus /></button>
            <label><span className="sr-only">Votre message</span><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Écrivez votre message..." /></label>
            <button type="submit" className="send-button" aria-label="Envoyer"><Send /></button>
          </form>
        </section>
      </div>
    </main>
  );
}

function ProfileView({ goHome }: { goHome: () => void }) {
  return (
    <main className="auth-page">
      <button className="auth-back" onClick={goHome}>
        <ArrowLeft /> Retour à la boutique
      </button>
      <section className="auth-card">
        <AppLogo />
        <span className="auth-kicker">BIENVENUE CHEZ VOUS</span>
        <h1>
          Connectez-vous
          <br />à votre marché.
        </h1>
        <p>
          Utilisez votre email et votre mot de passe pour retrouver vos
          commandes et vos échanges.
        </p>
        <div className="auth-actions">
          <Link
            className="primary-button"
            href="/connexion?profil=client&next=/client"
          >
            Se connecter <ArrowRight size={17} />
          </Link>
          <Link
            className="secondary-button"
            href="/connexion?profil=client&next=/client&mode=inscription"
          >
            Créer un compte
          </Link>
        </div>
        <small>
          <LockKeyhole size={13} /> Vos commandes et vos informations restent
          accessibles uniquement depuis votre espace.
        </small>
      </section>
    </main>
  );
}

function DashboardView({ goHome }: { goHome: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [inventory, setInventory] = useState([
    { name: "Chemise wax Ndar", sku: "MOD-001", price: 18500, stock: 24, status: "En stock" },
    { name: "Ensemble coton naturel", sku: "MOD-002", price: 21000, stock: 8, status: "Stock faible" },
    { name: "Bracelet tissé", sku: "ACC-004", price: 4500, stock: 0, status: "Épuisé" },
  ]);
  const addProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setInventory((items) => [{
      name: String(form.get("name")),
      sku: `MOD-00${items.length + 2}`,
      price: Number(form.get("price")),
      stock: Number(form.get("stock")),
      status: "En stock",
    }, ...items]);
    setShowForm(false);
  };
  return (
    <main className="merchant-dashboard">
      <aside className="dashboard-sidebar">
        <button onClick={goHome} className="dashboard-logo"><AppLogo /></button>
        <span className="merchant-mode">ESPACE MARCHAND</span>
        <nav><button className="is-active"><BarChart3 /> Vue d’ensemble</button><button><Package /> Produits</button><button><ShoppingBag /> Commandes <i>8</i></button><button><ShoppingBasket /> Stock</button><button><MessageCircle /> Messages <i>2</i></button><button><Star /> Avis clients</button><button><WalletCards /> Paiements</button><button><Settings /> Paramètres</button></nav>
        <div className="dashboard-store"><span>MA</span><div><b>Maison Awa</b><small>Boutique vérifiée · Démo</small></div><ChevronDown /></div>
      </aside>
      <section className="dashboard-main">
        <header><div><small>LUNDI 28 JUILLET</small><h1>Bonjour, Awa 👋</h1><p>Voici ce qui se passe dans votre boutique aujourd’hui.</p></div><div><button className="dashboard-icon"><Bell /><i /></button><button className="primary-button" onClick={() => setShowForm(true)}><Plus /> Ajouter un produit</button></div></header>
        <div className="stat-grid">
          <article><span><WalletCards /><small>CHIFFRE D’AFFAIRES</small></span><strong>485 200 F</strong><p><b>↑ 12,4 %</b> vs mois dernier</p></article>
          <article><span><ShoppingBag /><small>COMMANDES</small></span><strong>128</strong><p><b>↑ 8,2 %</b> vs mois dernier</p></article>
          <article><span><PackageCheck /><small>PANIER MOYEN</small></span><strong>18 450 F</strong><p><b>↑ 3,1 %</b> vs mois dernier</p></article>
          <article><span><Star /><small>NOTE BOUTIQUE</small></span><strong>4,9 <i>/ 5</i></strong><p>48 avis de démonstration</p></article>
        </div>
        <div className="dashboard-middle">
          <article className="revenue-card">
            <div className="card-heading"><div><small>PERFORMANCE</small><h2>Chiffre d’affaires</h2></div><button>30 derniers jours <ChevronDown /></button></div>
            <div className="chart-y"><span>150k</span><span>100k</span><span>50k</span><span>0</span></div>
            <div className="bar-chart" aria-label="Graphique de chiffre d'affaires">
              {[42, 58, 38, 71, 54, 82, 66, 91, 73, 88, 80, 100].map((height, index) => <i key={index} style={{ height: `${height}%` }} className={index === 11 ? "is-last" : ""} />)}
            </div>
            <div className="chart-labels"><span>1 Juil.</span><span>8 Juil.</span><span>15 Juil.</span><span>22 Juil.</span><span>28 Juil.</span></div>
          </article>
          <article className="orders-card">
            <div className="card-heading"><div><small>AUJOURD’HUI</small><h2>Commandes récentes</h2></div><button>Voir tout</button></div>
            {[["AN", "Aïssatou N.", "#SM-2048", "18 500 F", "À préparer"], ["FD", "Fatou D.", "#SM-2047", "25 000 F", "En livraison"], ["MS", "Moussa S.", "#SM-2046", "9 500 F", "Livrée"]].map((order) => <div className="mini-order-row" key={order[2]}><span>{order[0]}</span><div><b>{order[1]}</b><small>{order[2]}</small></div><strong>{order[3]}</strong><i className={order[4] === "Livrée" ? "done" : ""}>{order[4]}</i></div>)}
          </article>
        </div>
        <article className="inventory-card">
          <div className="card-heading"><div><small>CATALOGUE</small><h2>Stock & produits</h2></div><div><label><Search /><input placeholder="Rechercher..." /></label><button><SlidersHorizontal /> Filtrer</button></div></div>
          <div className="inventory-table">
            <div className="inventory-head"><span>PRODUIT</span><span>SKU</span><span>PRIX</span><span>STOCK</span><span>STATUT</span><span /></div>
            {inventory.map((item) => <div className="inventory-row" key={item.sku}><span><i className="inventory-thumb"><ShoppingBag /></i><b>{item.name}</b></span><span>{item.sku}</span><span>{formatPrice(item.price)}</span><span>{item.stock}</span><span><em className={item.status === "En stock" ? "stock-ok" : item.status === "Stock faible" ? "stock-low" : "stock-out"}>{item.status}</em></span><button>•••</button></div>)}
          </div>
        </article>
      </section>
      {showForm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
          <form className="product-form" onSubmit={addProduct}>
            <button type="button" className="modal-close" onClick={() => setShowForm(false)} aria-label="Fermer"><X /></button>
            <small>NOUVEAU PRODUIT</small><h2 id="product-form-title">Ajoutez un article</h2><p>Renseignez les informations essentielles. Vous pourrez ajouter les photos et variantes ensuite.</p>
            <label>Nom du produit<input name="name" required placeholder="Ex. Boubou en coton" /></label>
            <div><label>Prix en FCFA<input name="price" type="number" min="0" required placeholder="15000" /></label><label>Stock initial<input name="stock" type="number" min="0" required placeholder="10" /></label></div>
            <label>Description<textarea name="description" required placeholder="Décrivez la matière, la coupe et les détails utiles..." /></label>
            <button className="primary-button" type="submit">Ajouter au catalogue <ArrowRight /></button>
          </form>
        </div>
      )}
    </main>
  );
}

function CartDrawer({
  items,
  remove,
  add,
  close,
  onCheckout,
}: {
  items: Product[];
  remove: (id: number) => void;
  add: (product: Product) => void;
  close: () => void;
  onCheckout: () => void;
}) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <header><div><small>VOTRE SÉLECTION</small><h2 id="cart-title">Mon panier <span>{items.length}</span></h2></div><button onClick={close} aria-label="Fermer le panier"><X /></button></header>
        {items.length === 0 ? (
          <div className="empty-cart"><span><ShoppingBag /></span><h3>Votre panier est vide</h3><p>Ajoutez des produits pour préparer votre première commande.</p><button className="secondary-button" onClick={close}>Explorer la boutique</button></div>
        ) : (
          <>
            <div className="cart-items">{items.map((item, index) => <article key={`${item.id}-${index}`}><Image src={item.image} alt="" width={78} height={78} /><div><small>{item.merchant}</small><h3>{item.name}</h3><strong>{formatPrice(item.price)}</strong><span><button onClick={() => remove(item.id)} aria-label={`Diminuer la quantité de ${item.name}`}><Minus /></button><b>1</b><button onClick={() => add(item)} aria-label={`Augmenter la quantité de ${item.name}`}><Plus /></button></span></div><button className="remove-item" onClick={() => remove(item.id)} aria-label={`Retirer ${item.name}`}><X /></button></article>)}</div>
            <div className="cart-summary"><p><span>Sous-total</span><b>{formatPrice(subtotal)}</b></p><p><span>Livraison</span><b>à partir de 1 500 F</b></p><p className="cart-total"><span>Total estimé</span><strong>{formatPrice(subtotal + 1500)}</strong></p><button className="primary-button" onClick={onCheckout}>Choisir la livraison <ArrowRight /></button><small><ShieldCheck /> Délai et prix affichés avant paiement</small></div>
          </>
        )}
      </aside>
    </div>
  );
}

function CheckoutModal({ subtotal, close, complete }: { subtotal: number; close: () => void; complete: () => void }) {
  const [method, setMethod] = useState("wave");
  const [step, setStep] = useState<"delivery" | "payment">("delivery");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("standard");
  const [address, setAddress] = useState("Mermoz, Dakar");
  const [phone, setPhone] = useState("77 000 00 00");
  const [scheduledAt, setScheduledAt] = useState("");
  const [done, setDone] = useState(false);
  const delivery = DELIVERY_OPTIONS.find((option) => option.id === deliveryMode) ?? DELIVERY_OPTIONS[0];
  const total = subtotal + delivery.fee;
  const pay = () => { setDone(true); setTimeout(complete, 1300); };
  const confirmDelivery = (event: FormEvent) => {
    event.preventDefault();
    if (!address.trim() || !phone.trim()) return;
    setStep("payment");
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <section className="checkout-modal checkout-modal--guided">
        <button className="modal-close" onClick={close} aria-label="Fermer"><X /></button>
        {done ? <div className="payment-success"><span><Check /></span><small>COMMANDE SM-2048</small><h2>Commande confirmée !</h2><p>Votre marchand prépare les articles. Gardez le code <b>SM-2048</b> pour suivre la livraison sans vous connecter.</p></div> : <>
          <ol className="checkout-steps" aria-label="Étapes de commande">
            <li className="is-done"><i><Check /></i><span>Panier</span></li>
            <li className={step === "delivery" ? "is-active" : "is-done"}><i>{step === "payment" ? <Check /> : "2"}</i><span>Livraison</span></li>
            <li className={step === "payment" ? "is-active" : ""}><i>3</i><span>Paiement</span></li>
          </ol>
          {step === "delivery" ? <form className="delivery-form" onSubmit={confirmDelivery}>
            <small>ADRESSE, DÉLAI, PRIX</small><h2 id="checkout-title">Choisissez votre livraison</h2><p>Comparez le délai et le tarif avant de confirmer. Rien ne change sans votre accord.</p>
            <div className="delivery-options">
              {DELIVERY_OPTIONS.map((option) => (
                <button type="button" key={option.id} className={deliveryMode === option.id ? "is-active" : ""} onClick={() => setDeliveryMode(option.id)}>
                  <span>{option.icon === "calendar" ? <CalendarClock /> : option.icon === "express" ? <Zap /> : <Truck />}</span>
                  <i><b>{option.title}</b><small>{option.description}</small><em>{option.promise}</em></i>
                  <strong>{formatPrice(option.fee)}</strong>
                </button>
              ))}
            </div>
            <div className="delivery-fields">
              <label>Adresse de livraison<span><MapPin /><input value={address} onChange={(event) => setAddress(event.target.value)} required placeholder="Quartier, rue ou point de repère" /></span></label>
              <label>Téléphone du destinataire<span><Phone /><b>+221</b><input value={phone} onChange={(event) => setPhone(event.target.value)} required inputMode="tel" placeholder="77 000 00 00" /></span></label>
              {deliveryMode === "scheduled" && <label>Créneau souhaité<span><CalendarClock /><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required /></span></label>}
            </div>
            <div className="delivery-preview"><span><small>ARRIVÉE ESTIMÉE</small><b>{deliveryMode === "scheduled" ? "Au créneau choisi" : delivery.promise}</b></span><span><small>TOTAL ESTIMÉ</small><strong>{formatPrice(total)}</strong></span></div>
            <button className="primary-button" type="submit">Voir le paiement <ArrowRight /></button>
          </form> : <div className="payment-step">
          <button className="checkout-back" onClick={() => setStep("delivery")}><ArrowLeft /> Modifier la livraison</button>
          <small>PAIEMENT SÉCURISÉ · DÉMO</small><h2 id="checkout-title">Comment souhaitez-vous payer ?</h2><p>Le total inclut la livraison {delivery.title.toLocaleLowerCase("fr")}. Aucun débit réel ne sera effectué.</p>
          <div className="payment-options">
            <button className={method === "wave" ? "is-active" : ""} onClick={() => setMethod("wave")}><span className="pay-logo pay-logo--wave">W</span><i><b>Wave</b><small>Payer avec votre compte mobile</small></i><em>{method === "wave" && <Check />}</em></button>
            <button className={method === "orange" ? "is-active" : ""} onClick={() => setMethod("orange")}><span className="pay-logo pay-logo--orange">OM</span><i><b>Orange Money</b><small>Confirmer depuis votre téléphone</small></i><em>{method === "orange" && <Check />}</em></button>
            <button className={method === "card" ? "is-active" : ""} onClick={() => setMethod("card")}><span className="pay-logo"><CreditCard /></span><i><b>Carte bancaire</b><small>Visa ou Mastercard</small></i><em>{method === "card" && <Check />}</em></button>
          </div>
          <div className="checkout-total"><span>Total à payer</span><strong>{formatPrice(total)}</strong></div>
          <button className="primary-button" onClick={pay}><LockKeyhole /> Payer {formatPrice(total)}</button>
          <small className="security-note"><ShieldCheck /> Démonstration : aucune donnée bancaire n’est collectée.</small>
          </div>}
        </>}
      </section>
    </div>
  );
}

function SiteFooter({ setView }: { setView: (view: View) => void }) {
  return (
    <footer className="shop-footer" id="footer-information">
      <div className="app-shell footer-main">
        <div><AppLogo /><p>La marketplace qui rend chaque commande claire, du vendeur à la livraison.</p><span className="footer-locale"><MapPin size={14} /> Sénégal · Couverture par zone</span></div>
        <div><h3>Acheter</h3><a href="#categories">Catégories</a><a href="#produits">Nouveautés</a><button onClick={() => setView("tracking")}>Suivre ma commande</button></div>
        <div><h3>Vendre</h3><button onClick={() => window.location.assign("/marchand")}>Espace marchand</button><button onClick={() => window.location.assign("/marchand")}>Devenir partenaire</button><button onClick={() => setView("messages")}>Centre d’aide</button></div>
        <div><h3>Une question ?</h3><button onClick={() => setView("messages")} className="footer-message"><MessageCircle /><span><b>Écrivez-nous</b><small>Messagerie de démonstration</small></span><ArrowRight /></button></div>
      </div>
      <div className="app-shell footer-bottom"><span>© 2026 SunuShop · Concept fictif de démonstration</span><div><a href="#footer-information">Confidentialité</a><a href="#footer-information">Conditions</a><a href="#footer-information">Accessibilité</a></div></div>
    </footer>
  );
}

function BottomNav({ view, setView, cartCount, openCart }: { view: View; setView: (view: View) => void; cartCount: number; openCart: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="Navigation mobile">
      <button className={view === "home" ? "is-active" : ""} onClick={() => setView("home")}><Home /><span>Accueil</span></button>
      <button className={view === "tracking" ? "is-active" : ""} onClick={() => setView("tracking")}><LocateFixed /><span>Suivi</span></button>
      <button onClick={openCart} className="bottom-cart"><ShoppingBag />{cartCount > 0 && <i>{cartCount}</i>}<span>Panier</span></button>
      <button className={view === "messages" ? "is-active" : ""} onClick={() => setView("messages")}><MessageCircle /><span>Messages</span></button>
      <button className={view === "profile" ? "is-active" : ""} onClick={() => setView("profile")}><UserRound /><span>Compte</span></button>
    </nav>
  );
}

export function ShopApp() {
  const [view, setView] = useState<View>("home");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Product[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [messageMerchant, setMessageMerchant] = useState("Maison Awa");
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const addToCart = (product: Product) => {
    setCart((items) => [...items, product]);
    showToast(`${product.name} ajouté au panier`);
  };
  const message = (merchant: string) => {
    setMessageMerchant(merchant);
    setView("messages");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const go = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const subtotal = cart.reduce((sum, product) => sum + product.price, 0);

  if (view === "dashboard") {
    return <><DashboardView goHome={() => go("home")} />{toast && <div className="toast"><CheckCircle2 /> {toast}</div>}</>;
  }

  return (
    <div className="shop-app" id="top">
      <StoreHeader view={view} setView={go} cartCount={cart.length} openCart={() => setCartOpen(true)} search={search} setSearch={setSearch} />
      {view === "home" && <Storefront onAdd={addToCart} onMessage={message} onTrack={() => go("tracking")} search={search} setSearch={setSearch} />}
      {view === "tracking" && <TrackingView goHome={() => go("home")} />}
      {view === "messages" && <MessagesView initialMerchant={messageMerchant} goHome={() => go("home")} />}
      {view === "profile" && <ProfileView goHome={() => go("home")} />}
      {view === "home" && <SiteFooter setView={go} />}
      <BottomNav view={view} setView={go} cartCount={cart.length} openCart={() => setCartOpen(true)} />
      {cartOpen && <CartDrawer items={cart} add={(product) => setCart((items) => [...items, product])} remove={(id) => setCart((items) => { const index = items.findIndex((item) => item.id === id); return index < 0 ? items : items.filter((_, itemIndex) => itemIndex !== index); })} close={() => setCartOpen(false)} onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }} />}
      {checkoutOpen && <CheckoutModal subtotal={subtotal} close={() => setCheckoutOpen(false)} complete={() => { setCheckoutOpen(false); setCart([]); go("tracking"); showToast("Commande confirmée"); }} />}
      {toast && <div className="toast"><CheckCircle2 /> {toast}</div>}
    </div>
  );
}
