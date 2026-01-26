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
│   ├── OfferPricingCard.tsx           # Détail de l'offre + comparaison
│   └── InfoBlock.tsx                  # Bloc informatif
├── hooks/
│   └── useConsumptionEuroCalcs.ts     # Calculs des coûts (HC/HP, TEMPO, BASE)
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
   - Séparation HC/HP via les plages horaires du PDL

2. **Offres tarifaires** (depuis API)
   - Clé : `['energy-offers']`
   - Tous les prix par tranche tarifaire

3. **Fournisseurs** (depuis API)
   - Clé : `['energy-providers']`
   - Noms et logos des fournisseurs

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
- Taxes (CTA, CSPE, TCFE)
- TVA (5.5% abonnement, 20% consommation)

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
| `GET /energy-offers`    | Query    | Liste des offres tarifaires            |
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
