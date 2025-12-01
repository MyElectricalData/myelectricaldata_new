# Page Consommation Euro

**Route:** `/consumption_euro`

## Description

Page permettant aux utilisateurs de **visualiser leur consommation electrique convertie en euros** selon les tarifs de leur fournisseur d'energie.

## Etat d'implementation actuel

### Statut : Coming Soon (placeholder)

La page affiche actuellement un placeholder avec les fonctionnalites a venir.

---

## Fonctionnalites a implementer

### 1. Prerequis

- Les donnees de consommation kWh doivent etre recuperees via `/consumption_kwh`
- L'utilisateur doit avoir configure son option tarifaire (`pricing_option` sur le PDL)
- Une offre tarifaire doit etre selectionnee

### 2. Conversion kWh en euros

#### 2.1 Selection de l'offre tarifaire

- Liste des offres disponibles depuis `/api/energy-offers`
- Filtrage par type de tarif (BASE, HC/HP, TEMPO, EJP)
- Affichage du prix kWh par tranche

#### 2.2 Calcul automatique

- Multiplier la consommation kWh par le prix unitaire
- Pour HC/HP : appliquer les tarifs differencies selon les plages horaires
- Pour TEMPO : appliquer les 6 prix selon couleur jour + HC/HP

### 3. Affichage des couts

#### 3.1 Couts par annee

- Total annuel en euros
- Comparaison avec annee precedente
- Evolution en pourcentage

#### 3.2 Couts par mois

- Graphique en barres des couts mensuels
- Comparaison N vs N-1

#### 3.3 Repartition des couts

- Pour HC/HP : repartition du cout HC vs HP
- Pour TEMPO : repartition par couleur de jour

### 4. Estimation facture

- Projection mensuelle basee sur la moyenne
- Alerte si depassement budget

---

## Architecture cible

```
apps/web/src/pages/ConsumptionEuro/
├── index.tsx                           # Page principale
├── components/
│   ├── OfferSelector.tsx              # Selecteur d'offre tarifaire
│   ├── YearlyCosts.tsx                # Couts annuels
│   ├── MonthlyCosts.tsx               # Couts mensuels
│   ├── CostDistribution.tsx           # Repartition des couts
│   └── BillEstimation.tsx             # Estimation facture
├── hooks/
│   ├── useEuroCosts.ts                # Calculs des couts
│   └── useOfferPricing.ts             # Gestion des tarifs
└── types/
    └── euro.types.ts                  # Types TypeScript
```

---

## Dependances

### Donnees requises

1. **Consommation kWh** (depuis cache ou API)
   - Donnees quotidiennes
   - Donnees detaillees HC/HP

2. **Offres tarifaires** (depuis `/api/energy-offers`)
   - Prix kWh par tranche
   - Abonnement mensuel

3. **Configuration PDL**
   - `pricing_option` : type de tarif (BASE, HC/HP, TEMPO, EJP)
   - `offpeak_hours` : plages heures creuses

### APIs backend

- `GET /energy-offers` : Liste des offres
- `GET /energy-offers/{id}` : Detail d'une offre

---

## Notes techniques

### Calculs des couts

```typescript
// BASE
cost = consumption_kwh * price_base

// HC/HP
cost = consumption_hc * price_hc + consumption_hp * price_hp

// TEMPO
cost = sum(
  consumption_blue_hc * price_blue_hc +
  consumption_blue_hp * price_blue_hp +
  consumption_white_hc * price_white_hc +
  consumption_white_hp * price_white_hp +
  consumption_red_hc * price_red_hc +
  consumption_red_hp * price_red_hp
)
```

### Gestion des taxes

- Prix TTC incluant :
  - TURPE (acheminement)
  - Taxes (CTA, CSPE, TCFE)
  - TVA (5.5% abonnement, 20% consommation)

---

## Workflow utilisateur

1. **Etape 1** : Recuperer les donnees kWh (page `/consumption_kwh`)
2. **Etape 2** : Selectionner une offre tarifaire
3. **Etape 3** : Visualiser les couts

---

## Fichiers lies

- **Frontend** : `apps/web/src/pages/ConsumptionEuro/`
- **API offres** : `apps/api/src/routers/energy_offers.py`
- **Types** : `apps/web/src/types/api.ts`
