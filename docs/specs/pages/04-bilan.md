---
name: bilan
id: bilan
path: /bilan
description: Page de bilan énergétique entre consommation et production
mode_client: true
mode_server: true
menu: Bilan
---

# Page Bilan Énergétique

**Route:** `/balance`

## Description

Page permettant de visualiser le **bilan énergétique** entre la consommation et la production d'électricité. Destinée aux utilisateurs disposant d'une installation de production (panneaux solaires, éolienne, etc.).

## Prérequis

- Au moins un PDL avec des données de **production** (directement ou via PDL lié)
- Données de consommation et de production chargées en cache

## Fonctionnalités principales

### 1. Cartes de résumé (BalanceSummaryCards)

4 métriques clés sur la période (3 ans par défaut) :

| Carte                | Icône                 | Description                          |
| -------------------- | --------------------- | ------------------------------------ |
| **Consommation**     | Maison (bleu)         | Total énergie consommée (kWh)        |
| **Production**       | Soleil (jaune)        | Total énergie produite (kWh)         |
| **Bilan Net**        | Tendance (vert/rouge) | Différence production - consommation |
| **Autoconsommation** | % (violet)            | Taux d'autoconsommation              |

### 2. Sélecteur d'années

- Boutons colorés pour chaque année disponible
- Sélection/désélection pour comparer
- Production totale affichée par année

### 3. Comparaison mensuelle (MonthlyComparison)

Graphique en barres consommation vs production par mois.

### 4. Courbe de bilan net (NetBalanceCurve)

Graphique linéaire du bilan net journalier (surplus vert, déficit rouge).

### 5. Tableau annuel (YearlyTable)

Récapitulatif par année : consommation, production, bilan net, taux autoconsommation.

### 6. Bloc d'informations (InfoBlock)

Section dépliable avec explications sur les calculs.

## Architecture des fichiers

```text
apps/web/src/pages/Balance/
├── index.tsx
├── components/
│   ├── BalanceSummaryCards.tsx
│   ├── MonthlyComparison.tsx
│   ├── NetBalanceCurve.tsx
│   ├── YearlyTable.tsx
│   └── InfoBlock.tsx
├── hooks/
│   ├── useBalanceData.ts
│   └── useBalanceCalcs.ts
└── types/
    └── balance.types.ts
```

## Technologies

- React + TypeScript
- React Query (cache)
- Zustand (état)
- Recharts (graphiques)
- Tailwind CSS + mode sombre
