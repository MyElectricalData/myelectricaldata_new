---
name: consumption-euro
id: consumption-euro
path: /consumption_euro
description: Visualisez et analysez le coût de votre consommation en euros
mode_client: true
mode_server: true
menu: Consommation
tab: <logo euro> Euro
---

# Page Consommation Euro

**Route:** `/consumption_euro`

## Description

Page permettant aux utilisateurs de **visualiser leur consommation électrique convertie en euros** selon les tarifs de leur fournisseur d'énergie. Supporte les options tarifaires BASE, HC/HP, TEMPO et EJP.

## État d'implémentation

### Statut : ✅ Implémentée

La page est entièrement fonctionnelle avec toutes les fonctionnalités principales.

---

## Fonctionnalités

### 1. Prérequis et états

#### 1.1 État sans données

- Affiche un message invitant l'utilisateur à récupérer ses données via le bouton "Récupérer" du header
- Bloc informatif avec les étapes : Récupérer → Sélectionner offre → Visualiser

#### 1.2 État sans offre sélectionnée

- **Sélecteur d'offre intégré** : L'utilisateur peut directement choisir son offre tarifaire depuis la page
- Sélection en cascade : Fournisseur → Type d'offre → Offre spécifique
- Filtrage automatique par puissance souscrite du PDL
- Désactivé en mode démo avec message explicatif

#### 1.3 Auto-chargement démo

- Détection automatique du compte démo
- Chargement automatique des données si non présentes en cache
- Suivi du PDL pour éviter les rechargements inutiles

### 2. Statistiques de coûts

#### 2.1 Cartes de synthèse (`EuroCostCards`)

- Coût total sur la période
- Coût moyen mensuel
- Coût moyen journalier
- Évolution par rapport à l'année précédente

#### 2.2 Section pliable/dépliable

- Persistance de l'état d'expansion

### 3. Carte de tarification (`OfferPricingCard`)

- Affichage du nom du fournisseur et de l'offre
- Logo du fournisseur (via Clearbit API)
- Détail des prix par tranche (BASE, HP, HC, TEMPO)
- Puissance souscrite
- **Comparaison d'offres** : Possibilité de comparer avec une autre offre compatible

### 4. Graphiques (`EuroYearlyChart`)

- Graphique en barres des coûts mensuels
- Support du mode sombre
- Comparaison visuelle N vs N-1 (si données disponibles)

### 5. Détail mensuel (`EuroMonthlyBreakdown`)

- Tableau détaillé mois par mois
- Répartition HC/HP pour les offres concernées
- Comparaison avec l'année précédente
- Bloc « Taxes et contributions (estimation) » (`EuroTaxBreakdown`) dans le détail de chaque période :
  énergie HT, accise sur l'électricité, abonnement HT (CTA comprise) et TVA, avec leur part du total TTC

### 6. Bloc informatif (`InfoBlock`)

- Explication du fonctionnement des calculs
- Pliable/dépliable (auto-déplié si pas de données)

---

## Architecture

```
apps/web/src/pages/ConsumptionEuro/
├── index.tsx                           # Page principale avec états et logique
├── components/
│   ├── EuroCostCards.tsx              # Cartes statistiques (total, moyenne, évolution)
│   ├── EuroYearlyChart.tsx            # Graphique des coûts mensuels
│   ├── EuroMonthlyBreakdown.tsx       # Tableau détaillé par mois
│   ├── EuroTaxBreakdown.tsx           # Détail des taxes comprises dans le total
│   ├── OfferPricingCard.tsx           # Détail de l'offre + comparaison
│   └── InfoBlock.tsx                  # Bloc informatif
├── hooks/
│   ├── useConsumptionEuroCalcs.ts     # Calculs des coûts (HC/HP, TEMPO, BASE)
│   └── useEuroOffers.ts               # Offres, fournisseurs, offre du PDL (même close), comparateur
└── types/
    └── euro.types.ts                  # Types TypeScript (YearlyCost, etc.)
```

### Composant partagé

- `apps/web/src/components/OfferSelector.tsx` : Sélecteur d'offre en cascade (utilisé aussi dans PDLCard)

---

## Flux de données

### Sources de données

1. **Consommation détaillée** (depuis cache React Query)
   - Clé : `['consumptionDetail', pdl]`
   - Données demi-horaires ou horaires
   - Séparation HC/HP via les plages horaires du PDL, au prorata des minutes quand une plage commence ou finit dans un créneau de 30 min

2. **Offres tarifaires** (depuis API, historique compris)
   - Clé : `['energy-offers', 'with-history']`, définie une seule fois dans `apps/web/src/api/energyQueries.ts` (`offersWithHistoryQueryOptions`)
   - Appel `energyApi.getOffers(undefined, true)` : sans `include_history`, l'API ne rend que les offres actives et non expirées, et un PDL dont l'offre est close (`valid_to` passé ou `is_active` faux) perdrait son calcul en euros (MED-67)
   - Le cache contient toujours un `EnergyOffer[]`, partagé avec le Simulateur, `OfferSelector` et la contribution : toute lecture passe par `offersWithHistoryQueryOptions()`, jamais par un `queryFn` écrit à la main (une forme différente sous la même clé casserait l'autre page)

3. **Fournisseurs** (depuis API)
   - Clé : `['energy-providers']`, même règle (`providersQueryOptions`)
   - Noms et logos des fournisseurs

### Offre close du PDL

- `isOfferExpired` (`apps/web/src/utils/offers.ts`) : close = désactivée ou `valid_to` passé, même règle que le filtre de l'API
- `OfferPricingCard` affiche sous le nom de l'offre le badge « Offre close depuis le JJ/MM/AAAA · changer d'offre » (date en UTC, lien vers `/dashboard`), sauf si une offre de comparaison est choisie
- Le comparateur ne liste que les offres en cours de même puissance, plus l'offre du PDL (« Actuelle ») même close

4. **Configuration PDL**
   - `selected_offer_id` : ID de l'offre sélectionnée
   - `subscribed_power` : Puissance souscrite (pour filtrage)
   - `offpeak_hours` : Plages heures creuses

### Mutations

- `pdlApi.updateSelectedOffer(pdlId, offerId)` : Mise à jour de l'offre sélectionnée

---

## Calculs des coûts

Le hook `useConsumptionEuroCalcs` effectue les calculs selon le type d'offre :

```typescript
// BASE
cost = consumption_kwh * price_base;

// HC/HP
cost = consumption_hc * price_hc + consumption_hp * price_hp;

// TEMPO (6 prix différents)
cost = sum(
  consumption_blue_hc * price_blue_hc +
    consumption_blue_hp * price_blue_hp +
    consumption_white_hc * price_white_hc +
    consumption_white_hp * price_white_hp +
    consumption_red_hc * price_red_hc +
    consumption_red_hp * price_red_hp,
);
```

### Taxes incluses

Les prix des offres sont en TTC et incluent :

- TURPE (acheminement)
- Accise sur l'électricité (ex-TICFE / CSPE) et CTA
- TVA : 20 % sur la consommation ; sur l'abonnement, 5,5 % jusqu'au 31 juillet 2025 puis 20 % depuis le 1er août 2025

### Détail des taxes (`utils/electricityTaxes.ts`)

Le bloc `EuroTaxBreakdown` retrouve, mois par mois, ce que contient le total TTC (rien n'est ajouté) :

```typescript
consommationHT = consommationTTC / 1.2
moisTaux = offerPriceMonth(offre) ?? mois  // valid_from, à défaut price_updated_at de l'offre
accise = kWh * acciseRate(moisTaux)      // tarif légal « ménages » en vigueur à cette date
energieHT = consommationHT - accise      // fourniture et acheminement
abonnementHT = abonnementTTC / (1 + subscriptionVatRate(moisTaux))  // 5,5 % avant 2025-08, 20 % ensuite
TVA = (consommationTTC - consommationHT) + (abonnementTTC - abonnementHT)
```

Les taux suivent la date des prix de l'offre, pas le mois consommé : la page applique le prix actuel de l'offre
à toute la période, et ce prix TTC contient l'accise et la TVA d'abonnement de sa date. Retirer le taux d'un mois
ancien (1 €/MWh en 2023, TVA d'abonnement à 5,5 % avant août 2025) gonflerait l'énergie HT et l'abonnement HT.
Sans date connue sur l'offre, chaque mois garde son propre taux.

L'énergie HT peut être négative si le prix TTC de l'offre est inférieur à l'accise TTC (heures gratuites) :
elle s'affiche telle quelle pour que les lignes redonnent le total, seule la barre de répartition est bornée à 0.

Tarifs d'accise (€/kWh HT) : 0,0225 (2016), 0,001 (février 2022), 0,021 (février 2024), 0,0337 (février 2025),
0,02998 (août 2025), 0,03085 (février 2026), 0,03062 (août 2026). Les taux suivants s'ajoutent dans `ACCISE_RATES`.

La CTA est calculée sur la part fixe du TURPE, absente des données d'offre : elle reste comprise dans l'abonnement HT.

---

## États visuels

### Loading states

1. **Initialisation** : Écran vide pendant 100ms
2. **Chargement depuis cache** : `LoadingOverlay` avec `LoadingPlaceholder`
3. **Polling du cache** : Vérification toutes les 500ms pendant 5s max

### Dark mode

- Détection automatique via MutationObserver sur `document.documentElement`
- Passage du flag `isDarkMode` aux composants graphiques

---

## Workflow utilisateur

1. **Navigation** vers `/consumption_euro`
2. **Si pas de données** : Message d'invitation + bouton "Récupérer" dans le header
3. **Si pas d'offre** : Sélecteur d'offre intégré à la page
4. **Si données + offre** : Affichage complet des statistiques et graphiques
5. **Optionnel** : Comparaison avec une autre offre via `OfferPricingCard`

---

## APIs backend utilisées

| Endpoint                | Méthode  | Description                            |
| ----------------------- | -------- | -------------------------------------- |
| `GET /pdls`             | Query    | Liste des PDLs avec offre sélectionnée |
| `GET /energy-providers` | Query    | Liste des fournisseurs                 |
| `GET /energy/offers?include_history=true` | Query | Liste des offres tarifaires, closes comprises |
| `PUT /pdls/{id}/offer`  | Mutation | Mise à jour de l'offre sélectionnée    |

---

## Fichiers liés

- **Frontend** : `apps/web/src/pages/ConsumptionEuro/`
- **Composant partagé** : `apps/web/src/components/OfferSelector.tsx`
- **API offres** : `apps/api/src/routers/energy_offers.py`
- **API PDL** : `apps/api/src/routers/pdl.py`
- **Types** : `apps/web/src/types/api.ts`

---

## Notes techniques

### Cache React Query - staleTime

La requête `['pdls']` utilise un `staleTime: 30 * 1000` (30 secondes) pour garantir que les modifications de fournisseur faites dans le Dashboard sont immédiatement visibles sur cette page sans nécessiter de refresh manuel.

```typescript
const { data: pdlsData } = useQuery({
  queryKey: ["pdls"],
  queryFn: async () => {
    /* ... */
  },
  staleTime: 30 * 1000, // Important pour la synchronisation fournisseur
});
```

Voir [Troubleshooting - Sync Fournisseur staleTime](/docs/troubleshooting/pdl-provider-sync-staletime.md) pour plus de détails.
