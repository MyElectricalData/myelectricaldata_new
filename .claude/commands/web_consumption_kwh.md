# Page Consommation kWh

## Directives d'agent

- **Pour l'UX/UI** (interface, composants, design) : Utiliser l'agent **frontend-specialist**
- **Pour le backend** (API, base de données, logique métier) : Utiliser l'agent **backend-specialist**

## Specifications de la page

**Toutes les specifications detaillees de cette page sont disponibles dans :**

- `@docs/pages/consumption.md` - Vue d'ensemble
- `@docs/pages/consumption-kwh.md` - Specifications detaillees kWh

**Avant de commencer a travailler sur cette page :**

1. Lis le fichier de specifications complet ci-dessus
2. Respecte l'ordre d'affichage des fonctionnalites defini dans les specs
3. Consulte les notes techniques importantes pour les details d'implementation

## Description rapide

Tu travailles sur la page `/consumption_kwh` de l'application MyElectricalData.

Cette page permet aux utilisateurs de **visualiser et analyser leur consommation electrique en kWh** recuperee depuis l'API Enedis.

## Statut : Implementation complete (100%)

Toutes les fonctionnalites specifiees sont implementees et operationnelles.

## Structure du dossier

```
apps/web/src/pages/ConsumptionKwh/
├── index.tsx                           # Page principale
├── components/
│   ├── AnnualCurve.tsx                # Courbe annuelle
│   ├── ConfirmModal.tsx               # Modal de confirmation
│   ├── DataFetchSection.tsx           # Section recuperation donnees
│   ├── HcHpDistribution.tsx           # Repartition HC/HP
│   ├── InfoBlock.tsx                  # Bloc d'information
│   ├── LoadingProgress.tsx            # Indicateurs de progression
│   ├── ModernButton.tsx               # Bouton moderne
│   ├── MonthlyHcHp.tsx                # HC/HP mensuel
│   ├── PDLSelector.tsx                # Selecteur PDL
│   ├── PowerPeaks.tsx                 # Pics de puissance
│   ├── YearlyConsumption.tsx          # Comparaison mensuelle
│   └── YearlyStatCards.tsx            # Cartes annuelles
├── hooks/
│   ├── useConsumptionCalcs.ts         # Calculs consommation
│   ├── useConsumptionData.ts          # Gestion donnees
│   └── useConsumptionFetch.ts         # Fetch API
└── types/
    └── consumption.types.ts           # Types TypeScript
```

## Fonctionnalites principales

1. **Selection du PDL** - Liste deroulante multi-PDL
2. **Recuperation des donnees** - Bouton fetch + cache Redis
3. **Statistiques annuelles** - Cartes par annee glissante
4. **Repartition HC/HP** - Camemberts par annee
5. **Courbe annuelle** - Comparaison mensuelle
6. **Courbe detaillee** - Navigation jour/semaine
7. **HC/HP mensuel** - Graphiques barres
8. **Pics de puissance** - Par annee avec reference

## Notes techniques

- Cache granulaire jour par jour
- Calculs par annee glissante (365 jours)
- Support intervalles PT30M/PT15M
- Mode sombre adaptatif
