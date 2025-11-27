---
sidebar_position: 1
title: Troubleshooting
description: Guides de résolution de problèmes
---

# Documentation de Dépannage

Index des guides de résolution de problèmes pour MyElectricalData.

## 📚 Guides Disponibles

### Cache & Persistance

#### [React Query Persist avec Queries Read-Only](./react-query-persist-readonly-queries.md)
**Problème:** Les données ne persistent pas après un refresh de page
**Concerne:** `consumptionDetail`, `productionDetail`
**Solution:** Approche hybride avec `useQuery` + `useState` + subscription
**Statut:** ✅ Résolu

#### [Debug : Cache Vide Après Récupération](./debug-cache-vide.md)
**Problème:** Le bouton "Récupérer" semble fonctionner mais le cache reste vide
**Concerne:** Toutes les données (consumption, production, power)
**Solution:** Guide de débogage étape par étape
**Statut:** 📋 Guide de diagnostic

### Simulateur

#### [Calcul de Consommation du Simulateur](./simulator-consumption-calculation.md)
**Problème:** Comprendre les calculs de consommation HC/HP
**Concerne:** Page `/simulator`
**Statut:** 📖 Documentation

#### [Correction des Doublons dans le Simulateur](./simulator-duplicates-fix.md)
**Problème:** Offres dupliquées affichées
**Concerne:** Page `/simulator`
**Statut:** 🔧 Fix appliqué

#### [Détection des Doublons](./comment-detecter-doublons.md)
**Problème:** Identifier les offres en double dans la base de données
**Concerne:** Admin `/admin/offers`
**Statut:** 🔍 Outil de diagnostic

## 🔍 Trouver Rapidement

### Par Symptôme

| Symptôme | Guide |
|----------|-------|
| Données disparaissent au refresh | [React Query Persist](./react-query-persist-readonly-queries.md) |
| Cache vide malgré fetch réussi | [Debug Cache Vide](./debug-cache-vide.md) |
| Offres dupliquées | [Simulateur Doublons](./simulator-duplicates-fix.md) |
| Calculs HC/HP incorrects | [Calcul Consommation](./simulator-consumption-calculation.md) |

### Par Page

| Page | Problèmes Connus | Guides |
|------|------------------|--------|
| `/consumption` | Persistance données | [React Query Persist](./react-query-persist-readonly-queries.md) |
| `/production` | Persistance données | [React Query Persist](./react-query-persist-readonly-queries.md) |
| `/simulator` | Doublons, calculs | [Doublons](./simulator-duplicates-fix.md), [Calculs](./simulator-consumption-calculation.md) |
| `/admin/offers` | Détection doublons | [Détection](./comment-detecter-doublons.md) |

### Par Technologie

| Technologie | Guides |
|-------------|--------|
| React Query | [Persist Read-Only](./react-query-persist-readonly-queries.md), [Cache Vide](./debug-cache-vide.md) |
| Zustand | - |
| React Query Persist | [Queries Read-Only](./react-query-persist-readonly-queries.md) |

## 🆘 Besoin d'Aide ?

Si votre problème n'est pas listé ici :

1. **Vérifier la console navigateur** (F12 → Console)
2. **Vérifier les logs backend** (`make backend-logs`)
3. **Consulter la documentation principale** (`/docs/`)
4. **Créer une issue GitHub** avec logs et reproduction du problème

## 🔧 Outils de Diagnostic

### Navigateur
- **React Query DevTools** : Panel en bas à droite (en dev)
- **Console** : F12 → Console (logs applicatifs)
- **Network** : F12 → Network (requêtes API)
- **Application** : F12 → Application → Local Storage

### Application
- **/diagnostic** : Page de diagnostic du cache
- **/admin/offers** : Vérification des offres (admin uniquement)

### Backend
```bash
# Logs en temps réel
make backend-logs

# Status des containers
make ps

# Shell PostgreSQL
make db-shell
```

## 📝 Contribuer

Pour ajouter un nouveau guide de dépannage :

1. Créer un fichier `.md` dans ce dossier
2. Utiliser la structure :
   ```markdown
   # Titre du Problème

   ## 🎯 Problème
   Description claire

   ## 🔍 Cause Root
   Explication technique

   ## ✅ Solution
   Code et étapes

   ## 🧪 Validation
   Comment vérifier que c'est corrigé
   ```
3. Ajouter une entrée dans ce README
4. Commit avec message descriptif

## 📚 Documentation Liée

- [Guide Développeur](/docs/CONTRIBUTING.md)
- [Architecture](/docs/architecture/)
- [Pages](/docs/pages/)
- [API](/docs/api/)
