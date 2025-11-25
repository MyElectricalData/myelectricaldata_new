# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **[Frontend]** Calendrier de navigation - Correction de l'alignement des jours pour le calendrier français
  - Les jours sont maintenant correctement alignés avec lundi en première colonne (L, M, M, J, V, S, D)
  - Fix: `getDay()` retourne 0 pour dimanche, ajout de transformation modulo `(getDay() + 6) % 7`
  - Exemple: 4 septembre 2025 (jeudi) s'affiche maintenant dans la colonne jeudi et non vendredi
  - Fichier: `apps/web/src/pages/Consumption/components/DetailedLoadCurve.tsx`

### Improved
- **[Frontend]** Navigation par jour dans la courbe de charge détaillée
  - Boutons de jour affichés sur 2 lignes : date complète (ex: "lun. 17 nov") + puissance (ex: "12.45 kWh")
  - Nombre de jours visibles calculé dynamiquement avec hook `useResponsiveDayCount`
  - Ajustement automatique selon la largeur du conteneur (min 3 jours, max 14 jours)
  - Fichier: `apps/web/src/pages/Consumption/hooks/useResponsiveDayCount.ts`

- **[Frontend]** Sélection de date intelligente dans le calendrier
  - Lorsqu'une date nécessite le chargement d'une nouvelle semaine, l'utilisateur arrive maintenant sur la date sélectionnée (et non la première date)
  - Implémentation d'un état `pendingDateSelection` pour mémoriser la date cliquée pendant le chargement
  - Navigation automatique vers le bon jour une fois les données chargées

- **[Frontend]** Comparaisons semaine -1 et année -1
  - Extraction automatique des données de comparaison depuis le cache React Query
  - Parcours intelligent des queries en cache pour trouver les données par filtrage de date
  - Support du format batch avec filtrage sur `interval_reading` array
  - Boutons de comparaison toujours actifs (suppression des checks de disponibilité restrictifs)
