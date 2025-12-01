# Page Consommation Euro

## Directives d'agent

- **Pour l'UX/UI** (interface, composants, design) : Utiliser l'agent **frontend-specialist**
- **Pour le backend** (API, base de données, logique métier) : Utiliser l'agent **backend-specialist**

## Specifications de la page

**Toutes les specifications detaillees de cette page sont disponibles dans :**

- `@docs/pages/consumption.md` - Vue d'ensemble
- `@docs/pages/consumption-euro.md` - Specifications detaillees Euro

**Avant de commencer a travailler sur cette page :**

1. Lis le fichier de specifications complet ci-dessus
2. Consulte la page `/consumption_kwh` pour le style et les patterns

## Description rapide

Tu travailles sur la page `/consumption_euro` de l'application MyElectricalData.

Cette page permettra aux utilisateurs de **visualiser leur consommation electrique convertie en euros** selon les tarifs de leur fournisseur.

## Statut : Coming Soon (placeholder)

La page affiche actuellement un placeholder "Coming Soon" avec les fonctionnalites a venir.

## Fichier principal

```
apps/web/src/pages/ConsumptionEuro/
└── index.tsx                           # Page placeholder
```

## Fonctionnalites a implementer

1. **Conversion kWh en euros** - Utiliser les donnees de `/consumption_kwh`
2. **Application des tarifs HC/HP** - Selon l'abonnement utilisateur
3. **Comparaison des couts** - Par periode (jour, mois, annee)
4. **Estimation facture mensuelle** - Projection basee sur l'historique

## Dependances

- Donnees de consommation kWh (depuis cache ou API)
- Offres tarifaires (depuis `/api/energy-offers`)
- Option tarifaire du PDL (`pricing_option`)

## Workflow utilisateur

1. Recuperer les donnees kWh (page `/consumption_kwh`)
2. Selectionner une offre tarifaire
3. Visualiser les couts

## Notes techniques

- Reutiliser les hooks de `ConsumptionKwh` pour les donnees
- Creer de nouveaux composants pour l'affichage en euros
- Gerer les differents types de tarifs (BASE, HC/HP, TEMPO, EJP)
