# Page France

## 🎯 Directives d'agent

- **Pour l'UX/UI** (interface, composants, design) : Utiliser l'agent **frontend-specialist**
- **Pour le backend** (API, base de données, logique métier) : Utiliser l'agent **backend-specialist**

## 📋 Spécifications de la page

**Toutes les spécifications détaillées de cette page sont disponibles dans :**

👉 `@docs/pages/france.md`

**Documentation des APIs RTE utilisées :**

👉 `@docs/external-apis/rte-api/consumption/consumption-api.md` (Consommation nationale)
👉 `@docs/external-apis/rte-api/generation/generation-forecast-api.md` (Production renouvelable)

## Description rapide

Page affichant les **données nationales de la France** en temps réel :

- **Consommation nationale** : Réalisé, intraday, prévisions J-1/J-2
- **Production renouvelable** : Solaire et éolien (graphique empilé)
- **Cartes résumé** : Consommation actuelle, solaire, éolien, total renouvelable

**Note** : Cette page utilise exclusivement les APIs RTE et n'existe qu'en mode serveur.
