# SunuShop — Design System & Guide de marque

> Document de référence pour créer tout support visuel (réseaux sociaux, carrousels, publicités, présentations, print). Toutes les valeurs listées proviennent directement du code de production de l'application (`app/globals.css`, `app/icon.svg`, `app/site-config.ts`).

---

## 1. Identité de marque

**Nom** : SunuShop
**Baseline officielle** : *« Chaque commande devient claire »*
**Tagline courte (visuels/OG)** : *« Vendez simplement. Commandez l'esprit clair. »*
**Sous-ligne** : *« Boutiques vérifiées · total visible · suivi de commande »*

**Description longue** : La marketplace sénégalaise qui transforme les catalogues sociaux en boutiques vérifiées et chaque demande en commande suivie.

**Description courte** : La marketplace sénégalaise pour acheter, vendre et suivre ses commandes.

**Positionnement** : Marketplace multi-vendeurs au Sénégal — connecte marchands (souvent issus de la vente sur réseaux sociaux) et acheteurs, avec boutiques vérifiées (KYC), paiement local (Wave, Orange Money) et suivi de commande.

**Marché / locale** : Sénégal (Dakar), français — `fr_SN`.

### Ton et voix
- **Chaleureux et rassurant** plutôt que corporate/tech froid.
- Vocabulaire ancré autour de la **clarté** et de la **confiance** : « boutiques vérifiées », « total visible », « esprit clair », « suivi de commande ».
- Esthétique **organique et artisanale** : formes légèrement irrégulières (ex. logo en forme de « soleil » aux bords asymétriques), palette terre/végétale plutôt que néons ou dégradés tech.
- Registre : phrases courtes, affirmatives, orientées bénéfice concret pour le vendeur ou l'acheteur.

---

## 2. Logo

### Composition du symbole (icône « soleil »)
Le symbole de marque est un **carré aux coins arrondis asymétriques évoquant un soleil/pastille organique** :
- Fond : couleur accent **Sun** `#f1ad32`
- Forme : `border-radius: 50% 50% 48% 52% / 45% 54% 46% 55%` — volontairement irrégulière, pas un cercle parfait ni un carré classique
- Légère rotation : `-4deg` (donne un effet « posé », vivant, pas rigide)
- Taille standard : 38×38px (variante compacte mobile : 27×27px)

### Wordmark (logotype texte)
- **« Sunu »** — police display (serif, voir section Typographie), `font-weight: 800`, couleur encre `--ink` (#17231d)
- **« Shop »** — même police, en **italique**, couleur accent clay `#b84d2d`
- `letter-spacing: -0.045em` (légèrement resserré)
- `font-size: 25px` en version standard

→ Le logo complet = pastille soleil orange + « Sunu » en encre + « Shop » en italique terracotta.

### Favicon / icône d'application (`app/icon.svg`)
Version simplifiée pour petits formats (favicon, app icon) :
```
Carré fond vert foncé #173f2e, coins arrondis (rx 18 sur 64px)
  → Cercle centré fond orange #f1ad32 (rayon 22)
    → Silhouette de sac de shopping tracée en vert foncé #173f2e (trait, sans remplissage)
```

### Variante image sociale (Open Graph, 1200×630)
- Fond plein **vert profond** `#173f2e`
- Badge rond orange `#f1ad32` avec « S »
- Texte « Sunu » en crème `#fffdf8` + « Shop » en orange `#f1ad32`
- Tagline et sous-ligne en dessous

### Règles d'usage recommandées
- **Fond clair** (crème/papier) : logo standard, wordmark en encre + clay.
- **Fond vert foncé** (`#173f2e` ou similaire) : utiliser la variante inversée (wordmark clair, comme sur l'OG image).
- Ne pas recolorer la pastille soleil en dehors de `#f1ad32`.
- Garder la légère rotation et l'irrégularité de la forme — ne pas la transformer en cercle parfait, c'est un trait distinctif.
- Espacement minimum autour du logo : conserver au moins la hauteur de la pastille soleil comme marge de respiration.

> ⚠️ Aucun fichier logo statique (PNG/SVG exporté en haute résolution, variantes light/dark packagées) n'existe actuellement dans le repo — le logo est généré en CSS/HTML à la volée. **Pour des supports externes (Canva, réseaux sociaux, print), il faudra recréer/exporter le logo en SVG/PNG à partir de ces spécifications**, ou me demander de générer ces exports.

---

## 3. Palette de couleurs

### Couleurs de fond & texte de base

| Nom | Token | Hex | Usage |
|---|---|---|---|
| Cream | `--cream` | `#f7f4ec` | Fond de page général |
| Paper | `--paper` | `#fffdf8` | Fond des cartes, header, panneaux |
| Ink | `--ink` | `#17231d` | Texte principal |
| Muted | `--muted` | `#6d746e` | Texte secondaire, légendes |
| Line | `--line` | `#dedfd7` | Bordures, séparateurs |

### Couleurs de marque (primaires)

| Nom | Token | Hex | Usage |
|---|---|---|---|
| **Green** | `--green` | `#173f2e` | Couleur primaire — boutons, headers, fonds sombres, sidebar |
| Green hover | `--green-2` | `#24563e` | État hover du vert primaire |
| Sage | `--sage` | `#dce7d7` | Vert clair — fonds d'icônes, hover léger |
| **Clay** | `--clay` | `#b84d2d` | Couleur secondaire/accent — badges, liens actifs, wordmark « Shop » |
| **Sun** | `--sun` | `#f1ad32` | Couleur accent/highlight — logo, focus, éléments décoratifs |
| Yellow | `--yellow` | `#ffd662` | Déclarée en réserve (peu utilisée) |

### Couleurs d'état (feedback)

| Nom | Token | Hex | Usage |
|---|---|---|---|
| Success | `--success` | `#21865c` | Confirmations, stock OK, livré |
| Warning | `--warning` | `#b97816` | Attente, stock faible |
| Danger | `--danger` | `#b23c32` | Erreurs, rupture de stock, déconnexion |

### Couleurs complémentaires (usage ponctuel, non tokenisées)

| Hex | Usage |
|---|---|
| `#122d21`, `#153d2b`, `#10241a` | Verts très foncés — sidebars dashboard, footer |
| `#f2e8da`, `#eadfcf`, `#e8dfd2` | Beiges — blocs hero, CTA, sections review |
| `#65d6ee` | Fond logo « Wave » (moyen de paiement) |
| `#f47a1f` | Fond logo « Orange Money » (moyen de paiement) |
| `#fff1d4` / `#dff2e8` / `#f8dfdc` | Fonds pastel badges warning/success/danger |

### Palette suggérée pour supports marketing (carrousels, etc.)

- **Fond principal** : Cream `#f7f4ec` ou Paper `#fffdf8` (clair, chaleureux)
- **Fond alternatif fort** : Green `#173f2e` (slides de contraste, CTA final)
- **Accent chaud dominant** : Sun `#f1ad32` (titres, highlights, formes décoratives)
- **Accent secondaire** : Clay `#b84d2d` (mots-clés, italique, prix)
- **Texte sur fond clair** : Ink `#17231d`
- **Texte sur fond vert** : Paper `#fffdf8` ou Cream `#f7f4ec`

Ombre standard à reproduire sur les cards/éléments flottants :
`box-shadow: 0 18px 55px rgba(32, 46, 38, 0.1)`

---

## 4. Typographie

### Familles de polices

```css
--display: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
--body: "Avenir Next", Avenir, "Segoe UI", sans-serif;
```

- **Display (serif)** — `Iowan Old Style` / `Palatino` / `Georgia` : utilisée pour **tous les titres**, gros chiffres/montants, wordmark du logo. Donne le caractère éditorial/chaleureux de la marque.
- **Body (sans-serif)** — `Avenir Next` / `Segoe UI` : texte courant, paragraphes, UI.

> ⚠️ Ce sont des polices système (aucune police auto-hébergée). Pour des supports où ces polices ne sont pas garanties disponibles (Canva, design web externe), utiliser des équivalents : **Georgia / Playfair Display / Lora** pour le display, **Helvetica Neue / Inter / Segoe UI** pour le texte courant.

### Échelle de tailles (repères)

| Usage | Taille |
|---|---|
| Micro-labels, badges | 7–8px |
| Texte courant, boutons | 9–12px |
| Sous-titres, prix | 14–22px |
| Titres de section | `clamp(39px, 4.2vw, 62px)` |
| Titre hero (H1) | `clamp(54px, 5.5vw, 82px)` |

### Graisses (font-weight)
`500`, `600`, `700`, `800`, `900` — les poids **800/900** dominent pour les labels/eyebrows en **majuscules** avec `letter-spacing` élargi (0.08em à 0.16em). Le texte courant utilise le poids par défaut (400).

### Règles de composition
- Titres → toujours en police display (serif), souvent avec un mot-clé en italique + couleur Clay pour l'emphase (comme dans le logo).
- Labels/eyebrows/badges → majuscules, sans-serif, gras (800-900), letter-spacing large.
- Corps de texte → sans-serif, poids normal, couleur Ink ou Muted.

---

## 5. Espacements & rayons

### Échelle d'espacement (tokens déclarés)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
```

### Rayons de bordure (tokens déclarés)

```css
--radius-sm: 10px;
--radius-md: 14px;
--radius-lg: 18px;
--radius-xl: 22px;
```

### Usages réels observés (valeurs en dur les plus fréquentes)
- **Pilule / capsule** (`999px`) : boutons, badges, barres de recherche, filtres — c'est **la signature visuelle dominante** de SunuShop, à réutiliser systématiquement pour CTA et tags sur les supports marketing.
- **Cards** : 16–26px de rayon.
- **Modales/drawers** : 22–23px.
- **Cercles parfaits** (`50%`) : icônes, avatars.

---

## 6. Composants & style UI (pour cohérence visuelle des mockups)

Pas de librairie UI (pas de shadcn/ui, pas de Material) — style 100% custom, cohérent avec l'identité « organique chaleureuse ».

### Boutons
- Hauteur min **46px**, forme **pilule** (`border-radius: 999px`)
- Texte : `font-weight: 800`, `font-size: 12px`
- **Primaire** : fond Green `#173f2e`, texte blanc, hover → Green-2 `#24563e` + léger soulèvement (`translateY(-2px)`)
- **Secondaire** : bordure grise `#c9ccc5`, fond blanc translucide
- **Light** : fond blanc, texte Green

### Cards
- Bordure fine 1px, gris clair (`--line` / `#e1e1da`)
- Rayon 16–18px
- Fond Paper ou blanc
- Ombre au survol (ombre standard ci-dessus)

### Badges / statuts
- Forme pilule, fonds pastel + texte couleur pleine correspondante (success/warning/danger)
- Texte minuscule (7-9px), très gras, souvent majuscules avec letter-spacing

### Inputs
- Hauteur ~45-47px, bordure 1px `--line`, rayon 10-12px (ou pilule pour barres de recherche)
- Focus : halo vert `box-shadow: 0 0 0 3px rgba(23,63,46,.08)` + bordure Green

### Modales / overlays
- Rayon 22-23px, ombre standard
- Backdrop : `rgba(10,22,15,0.52)` avec flou (`backdrop-filter: blur(4px)`)

---

## 7. Guide rapide pour créer un carrousel / support marketing

**Structure type recommandée** :
1. **Slide de fond clair** (Cream/Paper) avec titre serif + mot-clé en italique Clay
2. **Éléments décoratifs** : formes pilule et pastille « soleil » irrégulière en Sun `#f1ad32`
3. **Contraste** : alterner slides fond clair / slide fond Green foncé (`#173f2e`) pour rythmer
4. **CTA final** : bouton pilule Green avec texte blanc, gras, majuscules
5. **Badges de réassurance** : pilules pastel (vert clair = confiance/vérifié, orange = highlight)
6. **Toujours** : logo en haut (pastille soleil + « Sunu » encre + « Shop » italique clay) sur fond clair, ou variante inversée sur fond vert

**Mots-clés de copywriting à réutiliser** : clarté, vérifié, simple, suivi, esprit clair, boutiques vérifiées, total visible.

**À éviter** : dégradés tech/néon, formes géométriques strictes et froides, polices ultra-modernes type geometric sans-serif (Poppins, Montserrat) qui casseraient le ton éditorial/artisanal porté par la police serif display.

---

## 8. Éléments manquants à produire si besoin

- Export logo en SVG/PNG haute résolution (fond transparent, variantes clair/foncé) — actuellement généré en CSS uniquement
- Charte iconographique dédiée (le projet utilise `lucide-react`, une librairie d'icônes outline générique)
- Palette de photos/illustrations de marque (aucune direction artistique photo trouvée dans le code)

*Dis-moi si tu veux que je génère les exports logo (SVG/PNG) à partir de ces specs, ou un template de carrousel prêt à l'emploi.*
