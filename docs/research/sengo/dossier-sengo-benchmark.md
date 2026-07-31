---
sujet: "Benchmark SENGO pour SunuShop"
geographie: "Sénégal"
date_recherche: "2026-07-29"
verdict: "adopter-selectivement"
confiance_globale: "moyenne"
sources_count: 5
angle_recommande: "Savoir le prix, le délai et le statut avant de payer"
---

# Benchmark SENGO pour SunuShop

## 1. Résumé exécutif

SENGO combine une application mobile de mobilité et un site web multi-services couvrant transport de personnes, livraison, food, fret, déménagement, engins et GP international. Le meilleur enseignement pour SunuShop n'est pas de copier l'identité visuelle de SENGO, mais d'appliquer sa logique opérationnelle : choisir un service, indiquer le besoin, voir le prix et le délai, confirmer, puis suivre l'exécution.

Le signal public reste précoce : la fiche Google Play affiche 1 k+ téléchargements, 9 avis et une note de 4,8/5 au 29 juillet 2026. Une citation critique demande explicitement de revoir l'UI/UX. Les métriques marketing du site (500+ chauffeurs, 10 000+ livraisons, 99 % livré à temps) sont des affirmations de SENGO non vérifiées indépendamment.

Décision pour SunuShop : adopter les patterns de transparence, de progression et de suivi ; ne pas reprendre les affirmations non prouvées, la surcharge de services ni la DA bleu nuit/orange.

## 2. Périmètre et méthode

Méthode issue du dossier `Desktop/Mes-Skills/deep-research-vertical/deep-research-vertical` :

- collecte de la promesse, du parcours, des fonctionnalités, du pricing et des preuves visibles ;
- mining des avis publics disponibles ;
- distinction stricte entre fait observé, affirmation concurrente et hypothèse ;
- traduction des observations en décisions produit implémentables.

Sources consultées le 29 juillet 2026 :

1. Site public SENGO : https://sengo.pro/
2. Page transport : https://sengo.pro/transport
3. Réservation transport : https://sengo.pro/transport/book
4. Fiche Google Play : https://play.google.com/store/apps/details?id=com.sengo.app&hl=fr&gl=SN
5. Page Facebook publique : https://www.facebook.com/sengo.sn/

Limites : le certificat TLS de `sengo.pro` était expiré lors de la collecte (`notAfter=2026-06-20`). Les pages ont été lues en ignorant uniquement cette erreur de certificat. L'ancienne fiche Apple associée par les moteurs à SENGO pointe désormais vers une app nommée TownTrip ; elle n'est donc pas retenue comme preuve actuelle. Le faible volume d'avis publics ne permet pas une conclusion statistique solide.

## 3. Fiche concurrent

| Champ | Observation | Nature | Confiance |
|---|---|---|---|
| Nom | SENGO | Observé | Haute |
| Marché | Mobilité, livraison et services au Sénégal | Observé | Haute |
| Promesse app | « Réservez un chauffeur en quelques secondes à prix juste. » | Citation Google Play | Haute |
| Promesse site | « Livraison intelligente au Sénégal. Rapide, fiable, et connecté. » | Citation site | Haute |
| Cibles | Clients, chauffeurs, prestataires et entreprises | Observé | Haute |
| App Android | 1 k+ téléchargements, 4,8/5, 9 avis | Google Play au 2026-07-29 | Haute |
| Mise à jour Android | 16 juillet 2026 | Google Play | Haute |
| Prix public transport | Tarif estimatif visible avant réservation lorsqu'il est disponible | Description app/site | Moyenne |
| Paiement | Direct chauffeur/prestataire ; site mentionne mobile money et paiement à la livraison | Description concurrente | Moyenne |
| Site | Next.js, pages service dédiées, formulaires guidés | Observé | Haute |
| Risque technique visible | Certificat TLS expiré depuis le 20 juin 2026 | Mesuré | Haute |

## 4. Parcours observé

### Application

1. Connexion par numéro ou e-mail, avec promesse de mobilité connectée.
2. Accueil centré sur « Où allez-vous ? » et la carte.
3. Choix immédiat ou planifié.
4. Sélection du service/véhicule.
5. Estimation avant confirmation lorsque disponible.
6. Suivi de la mission, historique et messagerie.
7. Espace chauffeur séparé : missions, gains, évaluations, profil et disponibilité.

### Site web

1. Le hub « Commander » demande d'abord le type de service.
2. Chaque service possède une page d'orientation dédiée.
3. Le parcours transport collecte départ, destination, formule, passagers, paiement et départ immédiat ou planifié.
4. Un aperçu affiche tarif, distance, durée et chauffeurs visibles avant confirmation.
5. Le suivi public accepte un code sans imposer de compte.

## 5. Pattern-DNA utile à SunuShop

### Structure

- mobile first, une action dominante par écran ;
- carte ou contexte opérationnel au centre ;
- bandeau de saisie principal en haut ;
- bottom navigation à 4 ou 5 destinations ;
- progression besoin → estimation → confirmation → suivi.

### Couleur et matière

- SENGO utilise bleu nuit, orange et blanc ;
- SunuShop conserve volontairement son vert profond, argile, crème et jaune ;
- le pattern transféré est fonctionnel, pas cosmétique.

### Composants transférables

- choix de mode sous forme de cartes comparables ;
- prix et promesse de délai alignés dans la même carte ;
- départ immédiat ou planifié ;
- résumé avant paiement ;
- code de suivi public ;
- états visibles et action de contact contextuelle.

### Vérité latente

La décision structurante de SENGO est de rendre une opération physique incertaine lisible comme une séquence d'états. SunuShop doit faire la même chose pour la livraison e-commerce : le client sait ce qui va arriver, combien cela coûte et où en est la commande.

## 6. Mining des avis

Les trois avis textuels visibles publiquement lors de la collecte :

| Citation exacte | Date | Note | Ce que cela révèle | Source |
|---|---:|---:|---|---|
| « Je vous prie de revoir votre ui/ux de l'app ca reste beaucoup de chose Bonne continuation » | 2026-06-01 | Non affichée dans l'extrait collecté | La richesse fonctionnelle ne compense pas une interface ou un parcours encore chargé. | Google Play |
| « Excellent » | 2026-07-26 | Non affichée dans l'extrait collecté | Satisfaction positive, mais citation trop courte pour guider une décision produit. | Google Play |
| « by Sénégal for Sénégal » | 2026-07-15 | Non affichée dans l'extrait collecté | L'ancrage local est une source de préférence et d'identité. | Google Play |

Échantillon insuffisant : 3 textes visibles sur 9 avis au total. Aucun faux verbatim n'a été ajouté pour atteindre artificiellement un quota.

## 7. Forces, faiblesses et opportunités

### Forces

- promesse immédiatement compréhensible ;
- segmentation client/chauffeur ;
- parcours multi-services cohérent ;
- estimation avant engagement ;
- suivi temps réel et historique ;
- réservation immédiate ou planifiée ;
- ancrage sénégalais explicite.

### Faiblesses

- périmètre produit très large, avec risque de surcharge ;
- critique publique directe sur l'UI/UX ;
- preuves marketing du site non vérifiées ;
- certificat TLS expiré, ce qui affaiblit fortement la confiance ;
- cohérence externe fragile : ancien résultat Apple désormais associé à TownTrip ;
- certains textes du site décrivent la construction de pages (« a maintenant une vraie page ») plutôt que le bénéfice client.

### Positionnement vide pour SunuShop

SunuShop peut revendiquer une promesse plus précise : « Avant de payer, vous voyez le prix de livraison, le créneau et les étapes jusqu'à votre porte. » Cette promesse est adaptée au commerce et évite la dispersion multi-services de SENGO.

## 8. Bonnes pratiques retenues et décision

| Pratique | Impact | Effort | Décision | Mise en œuvre SunuShop |
|---|---:|---:|---|---|
| Checkout guidé en 3 étapes | Élevé | Moyen | Adopter | Panier → Livraison → Paiement |
| Modes standard, express, planifié | Élevé | Moyen | Adopter | Cartes comparant prix et délai |
| ETA visible avant paiement | Élevé | Faible | Adopter | Résumé « arrivée estimée » |
| Adresse et téléphone destinataire | Élevé | Faible | Adopter | Formulaire livraison |
| Total recalculé avant paiement | Élevé | Faible | Adopter | Sous-total + mode choisi |
| Code de suivi sans compte | Élevé | Faible | Adopter | Bloc SM-2048 dans Suivi |
| Progression visuelle | Moyen | Faible | Adopter | Indicateur 1/2/3 |
| Contact et notifications contextuels | Moyen | Moyen | Déjà présent | Livreurs, messages, alertes |
| Large portefeuille multi-services | Faible pour V1 | Élevé | Rejeter | Rester centré marketplace |
| Reprendre les métriques concurrentes | Risque élevé | N/A | Rejeter | Utiliser uniquement des preuves SunuShop vérifiées |
| Copier la DA SENGO | Faible | N/A | Rejeter | Conserver l'identité SunuShop |

## 9. Changements implémentés dans SunuShop

- panier : livraison annoncée « à partir de 1 500 F » au lieu d'un coût figé ;
- CTA du panier : « Choisir la livraison » ;
- checkout guidé : Panier, Livraison, Paiement ;
- modes : Standard, Express, Planifiée ;
- délai et frais visibles avant le paiement ;
- adresse, téléphone et créneau planifié ;
- total dynamique selon le mode ;
- confirmation avec code de commande ;
- suivi public par code sans connexion ;
- états de succès et d'erreur accessibles via `role=status`.

## 10. Recommandations suivantes

1. Remplacer les ETA fictives par un calcul serveur fondé sur zone, stock et disponibilité livreur.
2. Conserver l'adresse sous forme structurée : coordonnées, quartier, repère, instructions.
3. Signer chaque transition de statut côté serveur et notifier via SMS/push avec reprise sur erreur.
4. Rendre le lien de suivi temporaire, difficile à deviner et limité aux données nécessaires.
5. Tester sur le terrain les termes « standard », « express » et « planifiée » avec 5 à 8 clients sénégalais.
6. Ne publier aucune note, taux de ponctualité ou badge « vérifié » sans règle et preuve auditable.

## 11. DATA STRUCTURÉE

- concurrent: SENGO
- url_site: https://sengo.pro/
- url_android: https://play.google.com/store/apps/details?id=com.sengo.app&hl=fr&gl=SN
- pattern_central: besoin → estimation → confirmation → suivi
- angle_sunushop: prix + délai + statut visibles avant paiement
- pratiques_adoptees: checkout_guidé, livraison_standard_express_planifiee, eta_avant_paiement, suivi_sans_compte
- risques_observes: surcharge_UI, preuves_non_verifiees, TLS_expire, faible_volume_avis
- confiance: moyenne
