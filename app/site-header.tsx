"use client";

import Link from "next/link";
import { ArrowUpRight, Menu, Phone, X } from "lucide-react";
import { useState } from "react";

function HeaderCta({ light = false }: { light?: boolean }) {
  return (
    <span className={`pill-button ${light ? "pill-button--light" : ""}`}>
      <span>Voir la carte</span>
      <span className="pill-button__icon" aria-hidden="true">
        <ArrowUpRight size={14} />
      </span>
    </span>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
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
        <a href="#footer-contact" className="header-icon" aria-label="Voir les informations pratiques"><Phone size={15} /></a>
        <Link href="#carte"><HeaderCta light /></Link>
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
        <Link href="#carte" onClick={closeMenu}><HeaderCta /></Link>
      </nav>
    </header>
  );
}
