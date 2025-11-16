# Page Production

## 🎯 Directives d'agent

- **Pour l'UX/UI** (interface, composants, design) : Utiliser l'agent **frontend-specialist**
- **Pour le backend** (API, base de données, logique métier) : Utiliser l'agent **backend-specialist**

## 📋 Spécifications de la page

**Toutes les spécifications détaillées de cette page sont disponibles dans :**

👉 `@docs/pages/production.md`

**Avant de commencer à travailler sur cette page :**

1. Lis le fichier de spécifications complet ci-dessus
2. Respecte l'ordre d'affichage des fonctionnalités défini dans les specs
3. Consulte les notes techniques importantes pour les détails d'implémentation

## Description rapide

Tu travailles sur la page `/production` de l'application MyElectricalData.

Cette page permet aux utilisateurs de **visualiser et analyser leur production d'énergie solaire** récupérée depuis l'API Enedis. Page équivalente à `/consumption` mais adaptée pour la production (sans puissance max, HC/HP, ni PowerPeaks).

## ⚠️ Statut : Implémentation partielle (~85%)

Structure créée et fonctionnelle, hooks implémentés, mais certains graphiques détaillés restent à implémenter.

**Fichier principal** : `apps/web/src/pages/Production/index.tsx`
