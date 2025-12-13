---
globs: apps/web/**/*
---

# Design System - Regles Critiques

**IMPORTANT : Pour toute modification UI significative, utiliser l'agent `frontend-specialist` qui a acces a la documentation complete et aux bonnes pratiques.**

Ce fichier contient les regles essentielles du design system. Pour la documentation complete, voir `docs/design/`.

## Structure de Page Obligatoire

```tsx
export default function MaPage() {
  return (
    <div className="pt-6 w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <IconComponent className="text-primary-600 dark:text-primary-400" size={32} />
          Titre de la Page
        </h1>
        <p className="text-gray-600 dark:text-gray-400">Description</p>
      </div>

      {/* Contenu */}
      <div className="space-y-6">
        {/* Sections */}
      </div>
    </div>
  );
}
```

**Regles strictes :**
- Container : `pt-6 w-full` (JAMAIS `pt-4`, `pt-8`, `px-*`)
- H1 : `text-3xl font-bold mb-2 flex items-center gap-3`
- Icone H1 : `text-primary-600 dark:text-primary-400` avec `size={32}`
- Sous-titre : `text-gray-600 dark:text-gray-400`

## Dark Mode - OBLIGATOIRE

**Chaque couleur DOIT avoir sa variante dark.**

### Texte
```tsx
text-gray-900 dark:text-white          // Titres
text-gray-600 dark:text-gray-400       // Secondaire
text-gray-700 dark:text-gray-300       // Labels
```

### Fonds
```tsx
bg-white dark:bg-gray-800              // Cards
bg-gray-50 dark:bg-gray-900/30         // Filtres
hover:bg-gray-100 dark:hover:bg-gray-700
```

### Bordures
```tsx
border-gray-300 dark:border-gray-700   // Standard
border-gray-300 dark:border-gray-600   // Inputs
```

### Primary
```tsx
text-primary-600 dark:text-primary-400                    // Icones, liens
bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600  // Boutons
```

## Composants Standards

### Card
```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-300 dark:border-gray-700 p-6 transition-colors duration-200">
```

### Input
```tsx
<input className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500" />
```

### Label
```tsx
<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
```

### Bouton Primary
```tsx
<button className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-lg transition-colors">
```

## Statuts (Info, Success, Warning, Error)

```tsx
// Info
<div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
  <p className="text-sm text-blue-800 dark:text-blue-200">Message</p>
</div>

// Success
bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200

// Warning
bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200

// Error
bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200
```

## Espacement

| Element | Classe |
|---------|--------|
| Entre sections | `mt-6` ou `space-y-6` |
| Apres header | `mb-6` |
| Card padding | `p-6` |
| Titre + icone | `gap-3` |
| Elements inline | `gap-2` |

## Icones (lucide-react)

| Contexte | Taille |
|----------|--------|
| H1 | `size={32}` |
| H2 | `size={20}` |
| Boutons | `size={16}` ou `size={18}` |
| Empty state | `size={48}` |

## Anti-Patterns (INTERDIT)

```tsx
// Couleur sans dark mode
<div className="bg-white">                    // INTERDIT
<div className="bg-white dark:bg-gray-800">   // OK

// Icone sans dark mode
<Icon className="text-primary-600" />                           // INTERDIT
<Icon className="text-primary-600 dark:text-primary-400" />     // OK

// Tailles non standard
<div className="pt-5">   // INTERDIT (utiliser pt-6)
<div className="mt-7">   // INTERDIT (utiliser mt-6 ou mt-8)

// Couleurs hardcodees
<div style={{color: '#0284c7'}}>   // INTERDIT

// Rounded non standard
<div className="rounded-2xl">   // INTERDIT (utiliser rounded-xl)
```

## Checklist Rapide

Avant commit, verifier :
- [ ] Container `pt-6 w-full`
- [ ] H1 avec icone `size={32}` et `text-primary-600 dark:text-primary-400`
- [ ] Tous les textes ont variante `dark:`
- [ ] Tous les backgrounds ont variante `dark:`
- [ ] Toutes les bordures ont variante `dark:`
- [ ] Icones avec `dark:text-primary-400`
- [ ] Tester visuellement en dark mode
- [ ] Pas de couleurs hardcodees

## Documentation Complete

Pour plus de details :
- Checklist complete : `docs/design/checklist.md`
- Composants : `docs/design/components/`
- Exemples : `docs/design/examples.md`
- Page reference : `apps/web/src/pages/Consumption/index.tsx`
