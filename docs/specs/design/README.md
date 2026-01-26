---
sidebar_position: 1
title: Design System
description: Guide complet du design system MyElectricalData
---

# Guide de Design - MyElectricalData

Documentation complète du design system de l'application MyElectricalData.

## 📚 Table des Matières

### 🎨 Composants

Toute la documentation des composants UI est organisée dans le dossier **[components/](components/)**

**Navigation rapide :**

- [📋 Index des Composants](components/README.md) - Vue d'ensemble et liens vers tous les composants

**Composants essentiels :**

- [Container](components/01-container.md) - Container principal avec `pt-6`
- [Header](components/02-header.md) - En-têtes de page (H1 + icône)
- [Sections](components/03-sections.md) - Sections collapsibles
- [Colors](components/04-colors.md) - Palette de couleurs
- [Forms](components/09-forms.md) - Inputs, labels, selects
- [States](components/11-states.md) - États interactifs (hover, disabled, loading)
- [Dark Mode](components/14-dark-mode.md) - Gestion du dark mode

### 📝 Guides Pratiques

- [✅ Checklist](checklist.md) - Checklist complète pour créer/modifier une page
- [💡 Exemples](examples.md) - Exemples de code complets prêts à utiliser

### 📦 Archive

- [Archive](archive/) - Anciens fichiers de design (référence historique)

## 🚀 Démarrage Rapide

### Pour créer une nouvelle page

1. **Lire la checklist** : [checklist.md](checklist.md)
2. **Consulter les composants essentiels** :
   - [Container](components/01-container.md) - Structure de base
   - [Header](components/02-header.md) - En-tête de page
   - [Sections](components/03-sections.md) - Organisation du contenu
3. **Copier un exemple** : [examples.md](examples.md)
4. **Vérifier la conformité** : Utiliser `/check_design`

### Pour modifier une page existante

1. **Identifier les composants à modifier** : [Index des Composants](components/README.md)
2. **Lire les règles du composant** concerné
3. **Vérifier les améliorations UX 2025** intégrées dans les composants
4. **Tester en dark mode** : [Dark Mode](components/14-dark-mode.md)

## 🎯 Principes Clés

### 1. Cohérence Visuelle

Toutes les pages doivent suivre les mêmes patterns pour une expérience utilisateur homogène.

### 2. Dark Mode First

Toujours implémenter le dark mode dès le début (jamais en afterthought).

### 3. Mobile First

Design responsive qui fonctionne d'abord sur mobile, puis s'adapte au desktop.

### 4. Always Visible

Les sections principales sont toujours visibles (pattern UX 2025) pour éviter le content shifting.

### 5. États Explicites

Les états (loading, disabled, error) doivent être visuellement clairs.

## 📐 Structure Type d'une Page

```tsx
export default function MaPage() {
  return (
    <div className="pt-6 w-full">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <IconComponent className="text-primary-600 dark:text-primary-400" size={32} />
          Titre de la Page
        </h1>
        <p className="text-gray-600 dark:text-gray-400">Description</p>
      </div>

      {/* Sections */}
      <div className="mt-6 card">{/* Contenu */}</div>
    </div>
  );
}
```

## 🎨 Palette de Couleurs Principale

```css
/* Primary (Bleu Ciel) */
text-primary-600 dark:text-primary-400

/* Texte */
text-gray-900 dark:text-white          /* Titres */
text-gray-600 dark:text-gray-400       /* Corps de texte */

/* Fonds */
bg-white dark:bg-gray-800              /* Cards */
bg-gray-50 dark:bg-gray-900/30         /* Filtres */

/* Bordures */
border-gray-300 dark:border-gray-700   /* Standard */
```

Voir [Colors](components/04-colors.md) pour la palette complète.

## ✨ Améliorations UX 2025

Les améliorations UX de janvier 2025 sont intégrées dans les composants :

- **Sections Always Visible** → [03-sections.md](components/03-sections.md)
- **États Conditionnels** → [11-states.md](components/11-states.md)
- **Détection du Cache** → [13-loading.md](components/13-loading.md)
- **Progression de Chargement** → [13-loading.md](components/13-loading.md)

## 🔍 Recherche Rapide

**Par composant :**

- Container → [01-container.md](components/01-container.md)
- Header → [02-header.md](components/02-header.md)
- Sections → [03-sections.md](components/03-sections.md)
- Boutons → [07-buttons.md](components/07-buttons.md)
- Cards → [08-cards.md](components/08-cards.md)
- Formulaires → [09-forms.md](components/09-forms.md)
- Icônes → [10-icons.md](components/10-icons.md)
- Filtres → [12-filters.md](components/12-filters.md)

**Par concept :**

- Couleurs → [04-colors.md](components/04-colors.md)
- Typographie → [05-typography.md](components/05-typography.md)
- Espacement → [06-spacing.md](components/06-spacing.md)
- États → [11-states.md](components/11-states.md)
- Loading → [13-loading.md](components/13-loading.md)
- Dark Mode → [14-dark-mode.md](components/14-dark-mode.md)
- Responsive → [15-responsive.md](components/15-responsive.md)

## 🤝 Contribution

Avant de modifier le design system :

1. Vérifier que le changement est cohérent avec les patterns existants
2. Mettre à jour la documentation du composant concerné
3. Ajouter des exemples de code
4. Tester en dark mode et responsive
5. Mettre à jour la checklist si nécessaire

## 📚 Ressources Externes

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev/)
- [React Hook Form](https://react-hook-form.com/)
- [React Query](https://tanstack.com/query/latest)

## 📞 Support

Pour toute question sur le design system :

1. Consulter d'abord la [Checklist](checklist.md)
2. Chercher dans l'[Index des Composants](components/README.md)
3. Voir les [Exemples](examples.md)

---

**Note** : Cette documentation est basée sur [Consumption/index.tsx](../apps/web/src/pages/Consumption/index.tsx) qui sert de référence avec un score de 100% de conformité.
