# Cards

## Vue d'ensemble

Les cards sont les conteneurs visuels principaux de l'application. Elles regroupent du contenu lié et créent une hiérarchie visuelle claire.

## Règles

1. Toujours inclure background + border + rounded + shadow
2. Padding standard : `p-6` pour header et contenu simple
3. Transitions sur les couleurs : `transition-colors duration-200`
4. TOUJOURS inclure variante dark mode
5. Espacement entre cards : `mt-6`

## Classes Standard

### Card Simple

```css
.card {
  bg-white dark:bg-gray-800
  rounded-xl
  shadow-md
  p-6
  border border-gray-300 dark:border-gray-700
  transition-colors duration-200
}
```

### Card Complète

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 p-6">
  {/* Contenu */}
</div>
```

## Code de référence

### Card Basique

```tsx
<div className="card">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
    Titre de la Card
  </h2>
  <p className="text-gray-600 dark:text-gray-400">
    Contenu de la card
  </p>
</div>
```

### Card avec Header et Contenu Séparés

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
  {/* Header */}
  <div className="p-6 border-b border-gray-200 dark:border-gray-700">
    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
      Configuration
    </h2>
  </div>

  {/* Contenu */}
  <div className="p-6">
    <div className="space-y-4">
      {/* Éléments */}
    </div>
  </div>
</div>
```

### Card Collapsible

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
  {/* Header cliquable */}
  <div
    className="flex items-center justify-between p-6 cursor-pointer"
    onClick={() => setIsExpanded(!isExpanded)}
  >
    <div className="flex items-center gap-2">
      <Icon className="text-primary-600 dark:text-primary-400" size={20} />
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Titre
      </h2>
    </div>
    <ChevronDown
      className={`transition-transform duration-200 ${
        isExpanded ? "rotate-180" : ""
      }`}
    />
  </div>

  {/* Contenu */}
  {isExpanded && (
    <div className="px-6 pb-6 space-y-8">
      {/* Contenu de la card */}
    </div>
  )}
</div>
```

## Exemples d'utilisation

### Card de Configuration

```tsx
<div className="card">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
    Configuration du PDL
  </h2>
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Point de Livraison
      </label>
      <select className="input">
        <option>Sélectionnez un PDL</option>
      </select>
    </div>
  </div>
</div>
```

### Card de Statistiques

```tsx
<div className="card">
  <div className="flex items-center gap-2 mb-4">
    <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
      Statistiques
    </h2>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div>
      <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">
        1,234 kWh
      </p>
    </div>
    {/* Autres stats */}
  </div>
</div>
```

### Card Vide (Empty State)

```tsx
<div className="card p-12 text-center">
  <TrendingUp className="mx-auto text-gray-400 mb-4" size={48} />
  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
    Aucune donnée disponible
  </h3>
  <p className="text-gray-600 dark:text-gray-400">
    Sélectionnez un PDL et récupérez les données
  </p>
</div>
```

### Card Hover

```tsx
<div className="card hover:shadow-lg transition-all cursor-pointer">
  <h3 className="text-base font-medium text-gray-900 dark:text-white">
    Offre Premium
  </h3>
  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
    Économisez jusqu'à 15%
  </p>
</div>
```

## Variantes

### Card avec Bordure Colorée

```tsx
<div className="card border-l-4 border-l-primary-600">
  <h3 className="text-base font-medium text-gray-900 dark:text-white">
    Information importante
  </h3>
  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
    Contenu
  </p>
</div>
```

### Card avec Fond Coloré

```tsx
<div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
  <p className="text-sm text-blue-800 dark:text-blue-200">
    <strong>ℹ️ Note :</strong> Information
  </p>
</div>
```

### Card Compacte

```tsx
<div className="p-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg">
  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
    Titre Compact
  </h4>
  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
    Contenu compact
  </p>
</div>
```

## À ne pas faire

### Pas de dark mode

```tsx
// ❌ INCORRECT
<div className="bg-white border-gray-300 rounded-xl shadow-md p-6">

// ✅ CORRECT
<div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl shadow-md p-6">
```

### Rounded incorrect

```tsx
// ❌ INCORRECT
<div className="card rounded-lg">  // Trop petit
<div className="card rounded-2xl"> // Trop grand

// ✅ CORRECT
<div className="card rounded-xl">
```

### Padding inconsistant

```tsx
// ❌ INCORRECT
<div className="card p-4"> // Trop petit pour une card principale
<div className="card p-8"> // Trop grand

// ✅ CORRECT
<div className="card p-6">
```

### Pas de transition

```tsx
// ❌ INCORRECT
<div className="card">

// ✅ CORRECT
<div className="card transition-colors duration-200">
```

### Shadow incorrecte

```tsx
// ❌ INCORRECT
<div className="card shadow-sm">  // Trop subtile
<div className="card shadow-lg">  // Trop forte

// ✅ CORRECT
<div className="card shadow-md">
```

## Accessibilité

### Card Cliquable

```tsx
<div
  className="card cursor-pointer hover:shadow-lg transition-all"
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyPress={(e) => e.key === 'Enter' && handleClick()}
>
  {/* Contenu */}
</div>
```

### Card avec Lien

```tsx
<Link to="/page">
  <div className="card hover:shadow-lg transition-all">
    {/* Contenu */}
  </div>
</Link>
```

## Voir aussi

- [03 - Sections](./03-sections.md) - Pour les cards collapsibles
- [04 - Couleurs](./04-colors.md) - Pour les couleurs de cards
- [06 - Espacement](./06-spacing.md) - Pour le padding et l'espacement
- [11 - États](./11-states.md) - Pour les états hover et focus
