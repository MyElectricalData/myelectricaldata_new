# Espacement

## Vue d'ensemble

L'espacement définit les marges, padding et gaps utilisés dans l'application. Une utilisation cohérente de l'espacement crée un rythme visuel agréable.

## Règles

1. Utiliser les valeurs Tailwind standard (multiples de 4px : 4, 8, 12, 16, 24, 32px)
2. Ne pas utiliser de valeurs intermédiaires (mt-5, p-7, etc.)
3. Respecter la hiérarchie : espacement plus grand = séparation plus importante
4. Toujours tester le responsive

## Échelle d'Espacement Tailwind

```css
0: 0px
1: 4px
2: 8px
3: 12px
4: 16px
5: 20px
6: 24px
8: 32px
12: 48px
16: 64px
```

## Marges (Margin)

### Entre Sections

```css
Entre sections principales: mt-6 (24px)
Après header de page: mb-6 (24px)
Entre éléments d'une section: mb-2, mb-3, mb-4
Entre blocs de formulaire: mb-4 (16px)
```

### Exemples

```tsx
// Header de page
<div className="mb-6">
  <h1>Titre</h1>
</div>

// Sections principales
<div className="mt-6">Section 1</div>
<div className="mt-6">Section 2</div>

// Éléments d'un formulaire
<div className="mb-4">
  <label className="mb-1">Label</label>
  <input />
</div>
```

## Padding

### Cards et Containers

```css
Card header: p-6 (24px)
Card content: px-6 pb-6 (24px horizontal, 24px bottom)
Petits éléments: p-4 (16px)
Blocs d'information: p-4 (16px)
```

### Exemples

```tsx
// Card avec header
<div className="p-6">
  <h2>Titre</h2>
</div>

// Contenu de card
<div className="px-6 pb-6">
  {/* Contenu */}
</div>

// Bloc d'information
<div className="p-4 bg-blue-50 dark:bg-blue-900/20">
  <p>Information</p>
</div>
```

### Container Principal

```css
Padding top obligatoire: pt-6 (24px)
Width: w-full
```

```tsx
<div className="pt-6 w-full">
  {/* Contenu de la page */}
</div>
```

## Gaps et Space

### Gap (Flexbox/Grid)

```css
Titre avec icône: gap-3 (12px)
Éléments inline: gap-2 (8px)
Boutons groupés: gap-2 (8px)
Filtres: gap-3 (12px)
```

### Space (Vertical/Horizontal)

```css
Contenu de section: space-y-8 (32px vertical)
Entre sous-éléments: space-y-4 (16px vertical)
Liste d'éléments: space-y-2 (8px vertical)
Boutons horizontaux: space-x-2 (8px horizontal)
```

## Code de référence

### Header de Page

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
    <Icon size={32} />
    Titre
  </h1>
  <p>Sous-titre</p>
</div>
```

### Section Collapsible

```tsx
<div className="mt-6 p-6">
  {/* Header */}
</div>
{isExpanded && (
  <div className="px-6 pb-6 space-y-8">
    {/* Contenu */}
  </div>
)}
```

### Formulaire

```tsx
<div className="space-y-4">
  <div className="mb-4">
    <label className="mb-1 block">Label</label>
    <input />
  </div>
  <div className="mb-4">
    <label className="mb-1 block">Label</label>
    <input />
  </div>
</div>
```

### Filtres

```tsx
<div className="flex flex-wrap gap-3 p-3">
  <div className="flex items-center gap-2">
    <Filter size={16} />
    <span>Filtres:</span>
  </div>
  <div className="flex items-center gap-2">
    <label>Catégorie:</label>
    <select />
  </div>
</div>
```

### Boutons Groupés

```tsx
<div className="flex gap-2">
  <button>Annuler</button>
  <button>Valider</button>
</div>
```

## Exemples d'utilisation

### Page Complète

```tsx
<div className="pt-6 w-full">
  {/* Header - mb-6 */}
  <div className="mb-6">
    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
      <Icon size={32} />
      Titre
    </h1>
    <p>Description</p>
  </div>

  {/* Sections - mt-6 entre chaque */}
  <div className="mt-6 p-6">
    <h2 className="mb-4">Configuration</h2>
    <div className="space-y-4">
      {/* Éléments */}
    </div>
  </div>

  <div className="mt-6 p-6">
    <h2 className="mb-4">Résultats</h2>
    <div className="space-y-8">
      {/* Composants */}
    </div>
  </div>
</div>
```

### Card avec Contenu Structuré

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
  {/* Header - p-6 */}
  <div className="p-6">
    <h2 className="text-lg font-semibold">Titre de la Section</h2>
  </div>

  {/* Contenu - px-6 pb-6 space-y-8 */}
  <div className="px-6 pb-6 space-y-8">
    <div className="space-y-4">
      <h3 className="text-base font-medium mb-2">Sous-section</h3>
      <p>Contenu</p>
    </div>
  </div>
</div>
```

### Liste avec Espacement

```tsx
<div className="space-y-2">
  <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded">Item 1</div>
  <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded">Item 2</div>
  <div className="p-3 bg-gray-50 dark:bg-gray-900/30 rounded">Item 3</div>
</div>
```

## À ne pas faire

### Valeurs non standard

```tsx
// ❌ INCORRECT
<div className="mt-5">  // 20px - pas dans l'échelle standard
<div className="p-7">   // 28px - pas dans l'échelle standard
<div className="gap-1.5"> // 6px - pas dans l'échelle standard

// ✅ CORRECT
<div className="mt-4">  // 16px
<div className="mt-6">  // 24px
<div className="p-6">   // 24px
<div className="p-8">   // 32px
<div className="gap-2"> // 8px
<div className="gap-3"> // 12px
```

### Espacement incohérent

```tsx
// ❌ INCORRECT - Espacement variable entre sections
<div className="mt-4">Section 1</div>
<div className="mt-6">Section 2</div>
<div className="mt-8">Section 3</div>

// ✅ CORRECT - Espacement cohérent
<div className="mt-6">Section 1</div>
<div className="mt-6">Section 2</div>
<div className="mt-6">Section 3</div>
```

### Oubli du padding top

```tsx
// ❌ INCORRECT - Pas de pt-6 sur le container principal
<div className="w-full">
  <h1>Titre</h1>
</div>

// ✅ CORRECT
<div className="pt-6 w-full">
  <h1>Titre</h1>
</div>
```

### Padding inconsistant dans les cards

```tsx
// ❌ INCORRECT
<div className="p-4">Header</div>
<div className="px-6 pb-6">Content</div>

// ✅ CORRECT
<div className="p-6">Header</div>
<div className="px-6 pb-6">Content</div>
```

### Space-y incorrect

```tsx
// ❌ INCORRECT - Space trop petit pour du contenu de section
<div className="px-6 pb-6 space-y-4">
  <ComponentA />
  <ComponentB />
</div>

// ✅ CORRECT
<div className="px-6 pb-6 space-y-8">
  <ComponentA />
  <ComponentB />
</div>
```

## Responsive

### Mobile First

Commencer avec l'espacement mobile, puis augmenter pour desktop :

```tsx
// Padding responsive
<div className="p-4 md:p-6">

// Gap responsive
<div className="flex flex-col gap-4 md:flex-row md:gap-6">

// Space responsive
<div className="space-y-4 md:space-y-6">
```

### Breakpoints

```css
sm: 640px   /* Small devices */
md: 768px   /* Medium devices */
lg: 1024px  /* Large devices */
xl: 1280px  /* Extra large devices */
```

## Voir aussi

- [01 - Container](./01-container.md) - Pour le padding du container principal
- [03 - Sections](./03-sections.md) - Pour l'espacement des sections
- [15 - Responsive](./15-responsive.md) - Pour l'espacement responsive
- [08 - Cards](./08-cards.md) - Pour le padding des cards
