# Page Consommation

## 🎯 Directives d'agent

- **Pour l'UX/UI** (interface, composants, design) : Utiliser l'agent **frontend-specialist**
- **Pour le backend** (API, base de données, logique métier) : Utiliser l'agent **backend-specialist**

## 📋 Structure des routes

La page Consommation utilise un **sous-menu avec deux onglets** :

| Route | Description | Commande |
|-------|-------------|----------|
| `/consumption` | Redirige vers `/consumption_kwh` | - |
| `/consumption_kwh` | Consommation en kWh (implémenté) | `/web_consumption_kwh` |
| `/consumption_euro` | Consommation en euros (coming soon) | `/web_consumption_euro` |

## 📋 Spécifications

**Spécifications détaillées :**

- 👉 `@docs/pages/consumption.md` - Vue d'ensemble et structure
- 👉 `@docs/pages/consumption-kwh.md` - Page kWh (fonctionnelle)
- 👉 `@docs/pages/consumption-euro.md` - Page Euro (à venir)

## Description rapide

La section Consommation permet aux utilisateurs de **visualiser et analyser leur consommation électrique** récupérée depuis l'API Enedis.

- **kWh** : Affiche les données brutes de consommation en kWh
- **Euro** : Convertira la consommation en euros selon les tarifs (à venir)

## Composants partagés

- `ConsumptionTabs.tsx` : Sous-menu avec onglets kWh/Euro
- Le Layout affiche automatiquement les tabs pour les routes `/consumption*`

## Fichiers principaux

| Fichier | Description |
|---------|-------------|
| `apps/web/src/components/ConsumptionTabs.tsx` | Composant des onglets |
| `apps/web/src/pages/ConsumptionKwh/` | Page kWh (dossier) |
| `apps/web/src/pages/ConsumptionEuro/` | Page Euro (dossier) |
