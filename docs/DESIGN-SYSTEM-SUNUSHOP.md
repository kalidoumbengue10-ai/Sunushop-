# DESIGN-SYSTEM — SunuShop

## 1. Registre visuel
Soft Editorial Light personnalisé par un pattern d’application minimaliste et une identité marchande sénégalaise.

## 2. Tokens

### Couleurs

- `--ss-bg: #F7F4EC` — fond principal chaud
- `--ss-paper: #FFFDF8` — surfaces et écrans
- `--ss-ink: #17231D` — texte principal
- `--ss-green: #173F2E` — action et marque
- `--ss-green-soft: #DCE7D7` — plans secondaires
- `--ss-clay: #B84D2D` — accent éditorial
- `--ss-sun: #F1AD32` — focus, orbite et signal
- `--ss-muted: #69736C` — texte secondaire
- `--ss-line: rgba(23, 35, 29, .14)` — bordures

### Typographie

| Style | Famille | Taille | Poids | Tracking | Interligne |
|---|---|---:|---:|---:|---:|
| Hero | Iowan Old Style / Palatino / Georgia | 48–88 px | 600 | -0.055em | .94 |
| H2 | même display | 40–64 px | 600 | -0.045em | 1 |
| H3 | même display | 24–32 px | 600 | -0.025em | 1.08 |
| Body | Avenir Next / Segoe UI | 16–18 px | 400–600 | 0 | 1.65 |
| Meta | même sans | 11 px | 800 | .14em | 1.2 |

### Espacement et formes

- Espacements autorisés : `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 144 px`.
- Radius : `10 px` contrôles, `18 px` cartes, `28 px` scènes, `999 px` capsules.
- Ombre appareil : `0 40px 90px rgba(23, 35, 29, .22)`.
- Ombre carte : `0 18px 50px rgba(23, 35, 29, .07)`.

## 3. Logo

Le symbole associe un soleil safran et un panier dessiné en monoline vert. Le wordmark « SunuShop » emploie la display; « Shop » passe en terre cuite. Une version symbole seule sert au favicon et aux petits écrans.

## 4. Iconographie

Lucide uniquement, grille `24 px`, trait `1.75 px`, caps et joins arrondis. Tailles : `16 px` inline, `20 px` actions, `24 px` services.

## 5. Composants

- Navigation : barre compacte blanche, liens 14 px, CTA vert, menu mobile à zone tactile 44 px.
- Bouton principal : capsule verte, hauteur 48 px, texte blanc, flèche dans un disque safran.
- Bouton secondaire : capsule papier, bordure végétale, hauteur 48 px.
- Cartes services : anatomies asymétriques, une preuve visuelle ou une mini-interface par carte.
- Téléphone : cadre encre `8 px`, radius `42 px`, écran papier et îlot noir.
- FAQ : accordéon natif `details/summary`, séparateurs fins, focus safran.

## 6. Motion

- Hover : `160 ms`.
- Press : `100 ms`.
- Reveal : `280 ms`, une seule orchestration au chargement.
- Easing : `cubic-bezier(.16, 1, .3, 1)`.
- Réduction automatique via `prefers-reduced-motion`.

## 7. Mobile first

À `375 px`, le H1 reste inférieur à `54 px`, le corps ne descend jamais sous `16 px`, les actions font au moins `44 px`, le téléphone central masque les appareils latéraux, les grilles s’empilent et le CTA « Ouvrir le marché » reste dans le premier écran.

## 8. Accessibilité

Contraste AA, focus visible safran de `3 px`, landmarks sémantiques, labels explicites, accordéons clavier natifs, textes alternatifs sur les images, aucun mouvement indispensable à la compréhension.

## 9. Déclinaisons

- OG `1200 × 630` : fond crème, logo en haut, promesse sur deux lignes, téléphone central.
- Carré `1080 × 1080` : téléphone central, orbite safran et bénéfice unique.
- Story `1080 × 1920` : logo, titre de 6 mots, téléphone et CTA vert.
- Email : surfaces mates, bouton vert plein, aucun blur ni effet d’orbite.

