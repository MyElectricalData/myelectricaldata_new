---
id: simulator
---
# Simulateur

**Route:** `/simulator`

## Description

Page permettant de **comparer automatiquement toutes les offres d'électricité** en utilisant les données de consommation réelles sur 12 mois.

## Fonctionnalités principales

### 1. Configuration

- Sélection du PDL (si plusieurs actifs)
- Filtrage automatique selon puissance souscrite
- Bouton "Lancer la simulation"

### 2. Récupération des données

- Chargement données horaires sur 365 jours
- Par périodes de 7 jours avec chevauchement
- Barre de progression détaillée
- Cache React Query (staleTime: 7 jours)

### 3. Résultats de simulation

- Tableau comparatif classé par coût total
- Pour chaque offre : Rang, fournisseur, type, coûts détaillés, écarts
- Badges d'alerte (avertissements, tarifs anciens)
- Highlight meilleure offre (fond vert)

### 4. Détails expandables

- Répartition consommation par type
- Calculs détaillés : kWh × prix = coût
- Grille tarifaire complète
- Messages d'avertissement

### 5. Export PDF

- PDF multi-pages professionnel
- Page 1 : Résumé + Top 10
- Pages suivantes : Détails complets (1 page/offre)
- Footer avec pagination et branding

### 6. Informations additionnelles

- Consommation totale sur période
- Économies potentielles
- Bloc d'information toujours visible

## Types d'offres supportées

1. **BASE** : Tarif unique
2. **BASE_WEEKEND** : Différencié semaine/week-end
3. **HC_HP** : Selon config PDL
4. **HC_NUIT_WEEKEND** : 23h-6h + week-end
5. **HC_WEEKEND** : Week-end + heures PDL
6. **SEASONAL** : Hiver/Été avec jours de pointe
7. **TEMPO** : 3 couleurs (Bleu/Blanc/Rouge)
8. **EJP** : 22 jours de pointe/an

## Technologies

- React 18 avec TypeScript
- React Query (cache partagé avec /consumption)
- jsPDF (génération PDF)
- Tailwind CSS
- Lucide React
- ModernButton component (glassmorphism + gradients)

## Fichiers liés

- **Frontend** : `apps/web/src/pages/Simulator.tsx` (1768 lignes)
- **API** : `apps/web/src/api/enedis.ts`, `energy.ts`, `tempo.ts`
- **Backend** : `apps/api/src/routers/enedis.py`, `energy.py`, `tempo.py`

## Optimisations

- **Cache partagé** avec /consumption (évite appels redondants)
- **Auto-lancement** si cache présent (≥2/3 périodes)
- Récupération intelligente avec vérification cache
- Lazy loading des détails expandables

## Notes importantes

- Données par périodes de 7 jours (pas mois)
- Cache 7 jours (pas 24h)
- Filtrage automatique selon puissance PDL
- Couleurs TEMPO en temps réel (API RTE)
- Support complet mode sombre

## Design moderne

### Boutons modernisés

La page utilise le composant `ModernButton` pour une expérience utilisateur améliorée :

**Bouton principal "Lancer la simulation"** :
- Variant : `primary` avec gradient bleu
- Taille : `lg` (large) avec `fullWidth`
- États : Loading avec spinner animé
- Icône : Calculator (masquée pendant le loading)

**Bouton "Exporter en PDF"** :
- Variant : `gradient` (bleu → indigo → violet)
- Taille : `sm` (compact)
- Icône : FileDown à gauche
- Affichage conditionnel (seulement si résultats disponibles)

### Avantages du design

- **Glassmorphism** : Effet de transparence avec backdrop-blur
- **Gradients animés** : Shine effect au hover
- **Performance** : Animations GPU-accelerated
- **Accessibilité** : Support complet des attributs ARIA
- **Dark mode** : Variantes optimisées pour mode sombre
- **Responsive** : Adapté mobile avec boutons full-width

Voir documentation complète : `docs/design/components/07-buttons.md`
