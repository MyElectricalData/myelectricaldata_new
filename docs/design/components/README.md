# Guide de Design - Index des Composants

Ce répertoire contient les guidelines de design pour tous les composants UI de MyElectricalData.

## Navigation rapide

### Structure et Layout

- [01 - Container Principal](./01-container.md) - Container principal avec `pt-6 w-full`
- [02 - Header de Page](./02-header.md) - En-têtes de page (H1 + icône + sous-titre)
- [03 - Sections](./03-sections.md) - Sections collapsibles et organisation du contenu

### Fondamentaux Visuels

- [04 - Couleurs](./04-colors.md) - Palette de couleurs complète (primary, status, backgrounds)
- [05 - Typographie](./05-typography.md) - Tailles et poids de police
- [06 - Espacement](./06-spacing.md) - Marges, padding, gaps

### Composants Interactifs

- [07 - Boutons](./07-buttons.md) - Boutons primaires, secondaires et variantes
- [08 - Cards](./08-cards.md) - Cards et conteneurs
- [09 - Formulaires](./09-forms.md) - Inputs, labels, selects, checkboxes
- [10 - Icônes](./10-icons.md) - Icônes Lucide React

### États et Interactions

- [11 - États](./11-states.md) - États interactifs (hover, focus, disabled, loading)
- [12 - Filtres](./12-filters.md) - Filtres et tri
- [13 - Loading](./13-loading.md) - États de chargement et progression

### Thèmes et Adaptabilité

- [14 - Dark Mode](./14-dark-mode.md) - Gestion du dark mode
- [15 - Responsive](./15-responsive.md) - Design responsive et mobile-first

## Autres Documents

### Patterns et Pratiques

- [Checklist](../checklist.md) - Checklist complète pour nouvelles pages
- [Exemples](../examples.md) - Exemples de code complets

### Documents Sources

- [Design Guidelines (Original)](../design-guidelines.md) - Document de référence complet

### Améliorations UX 2025

Les améliorations UX de janvier 2025 sont maintenant intégrées directement dans les composants :
- [03 - Sections](./03-sections.md) - Pattern "Always Visible"
- [11 - États](./11-states.md) - États conditionnels et déverrouillage progressif
- [13 - Loading](./13-loading.md) - Détection du cache et composants de progression
- [12 - Filtres](./12-filters.md) - Filtre "Récentes uniquement"

## Utilisation

Chaque fichier de composant suit le format :

```markdown
# [Nom du Composant]

## Vue d'ensemble

[Description courte]

## Règles

[Liste des règles à respecter]

## Code de référence

[Exemple de code complet]

## Exemples d'utilisation

[Cas d'usage courants]

## À ne pas faire

[Anti-patterns]

## Voir aussi

[Liens vers fichiers connexes]
```

## Contribution

Avant de modifier ces guidelines :

1. Vérifier la cohérence avec les pages existantes
2. Tester en light et dark mode
3. Valider sur mobile et desktop
4. Documenter les changements dans le fichier approprié

## Fichier de Référence

Toutes ces guidelines sont basées sur : `apps/web/src/pages/Consumption/index.tsx`
