# Sections Collapsibles

## Vue d'ensemble

Les sections collapsibles permettent d'organiser le contenu de manière hiérarchique et de réduire la charge cognitive en cachant les détails non nécessaires. Elles sont le pattern principal d'organisation du contenu.

## Règles

1. Card : `mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200`
2. Header : `flex items-center justify-between p-6 cursor-pointer`
3. H2 : `text-lg font-semibold text-gray-900 dark:text-white`
4. Icône de section : `size={20}` (plus petit que le titre principal H1)
5. Padding du contenu : `px-6 pb-6`
6. Espacement vertical du contenu : `space-y-8`
7. État désactivé : `opacity-60 cursor-not-allowed`
8. Animation du chevron : `transition-transform duration-200` avec `rotate-180`

## Code de référence

### Section Collapsible Complète

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
  {/* Header cliquable */}
  <div
    className={`flex items-center justify-between p-6 cursor-pointer ${
      isLoading ? "opacity-60 cursor-not-allowed" : ""
    }`}
    onClick={() => {
      if (!isLoading) {
        setIsSectionExpanded(!isSectionExpanded);
      }
    }}
  >
    {/* Titre avec icône */}
    <div className="flex items-center gap-2">
      <IconComponent className="text-primary-600 dark:text-primary-400" size={20} />
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Titre de la Section
      </h2>
    </div>

    {/* Indicateur Réduire/Développer */}
    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
      {isSectionExpanded ? (
        <span className="text-sm">Réduire</span>
      ) : (
        <span className="text-sm">Développer</span>
      )}
      <svg
        className={`w-5 h-5 transition-transform duration-200 ${
          isSectionExpanded ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  </div>

  {/* Contenu */}
  {isSectionExpanded && (
    <div className="px-6 pb-6 space-y-8">
      {/* Contenu de la section */}
    </div>
  )}
</div>
```

### Section avec État de Chargement

```tsx
const [isSectionExpanded, setIsSectionExpanded] = useState(false)
const [allLoadingComplete, setAllLoadingComplete] = useState(false)

<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
  <div
    className={`flex items-center justify-between p-6 ${
      allLoadingComplete ? "cursor-pointer" : "cursor-not-allowed opacity-60"
    }`}
    onClick={() => {
      if (allLoadingComplete) {
        setIsSectionExpanded(!isSectionExpanded);
      }
    }}
  >
    {/* Header */}
  </div>

  {/* Contenu affiché seulement si données chargées ET section dépliée */}
  {isSectionExpanded && allLoadingComplete && (
    <div className="px-6 pb-6 space-y-8">
      {/* Composants de visualisation */}
    </div>
  )}
</div>
```

## Exemples d'utilisation

### Section Statistiques (Consumption)

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
  <div
    className={`flex items-center justify-between p-6 ${
      allLoadingComplete ? "cursor-pointer" : "cursor-not-allowed opacity-60"
    }`}
    onClick={() => {
      if (allLoadingComplete) {
        setIsStatsExpanded(!isStatsExpanded);
      }
    }}
  >
    <div className="flex items-center gap-2">
      <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Statistiques de consommation
      </h2>
    </div>

    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
      {isStatsExpanded ? (
        <span className="text-sm">Réduire</span>
      ) : (
        <span className="text-sm">Développer</span>
      )}
      <svg
        className={`w-5 h-5 transition-transform duration-200 ${
          isStatsExpanded ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  </div>

  {isStatsExpanded && allLoadingComplete && (
    <div className="px-6 pb-6 space-y-8">
      <ConsumptionStats data={consumptionData} />
    </div>
  )}
</div>
```

### Section Non-Collapsible (Card Simple)

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 p-6">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
    Configuration
  </h2>
  {/* Contenu toujours visible */}
</div>
```

## États Visuels

### État Normal (Données Chargées)

- Opacité normale (100%)
- Curseur pointer
- Sections cliquables

```tsx
className="cursor-pointer"
```

### État Désactivé (Sans Données)

- Opacité réduite (60%)
- Curseur non-allowed
- Sections non cliquables

```tsx
className="opacity-60 cursor-not-allowed"
```

### État Transition

```tsx
className="transition-colors duration-200"
```

## Améliorations UX 2025

### Pattern : Sections Always Visible

Depuis janvier 2025, les sections sont TOUJOURS visibles dès l'arrivée sur la page, même sans données. Ce changement améliore considérablement l'expérience utilisateur.

#### Problème Résolu

Auparavant, les sections n'apparaissaient qu'après le chargement des données, créant :
- Du "content shifting" désagréable
- Une expérience utilisateur désordonnée
- Une mauvaise prédictibilité de l'interface

#### Solution

Toutes les sections sont maintenant rendues dès le chargement initial, avec des états visuels différents selon la disponibilité des données.

#### Code de référence

```tsx
// Les sections sont TOUJOURS affichées
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
  <div
    className={`flex items-center justify-between p-6 ${
      allLoadingComplete ? "cursor-pointer" : "cursor-not-allowed opacity-60"
    }`}
    onClick={() => {
      if (allLoadingComplete) {
        setIsExpanded(!isExpanded);
      }
    }}
  >
    {/* Header de section */}
  </div>

  {/* Contenu affiché seulement si données chargées ET section dépliée */}
  {isExpanded && allLoadingComplete && (
    <div className="px-6 pb-6 space-y-8">
      {/* Composants de visualisation */}
    </div>
  )}
</div>
```

#### États Visuels

**Sans Données (Disabled)**
- Opacité réduite : `opacity-60`
- Curseur non-allowed : `cursor-not-allowed`
- Sections pliées par défaut
- Non cliquable

**Avec Données (Enabled)**
- Opacité normale : 100%
- Curseur pointer : `cursor-pointer`
- Sections cliquables et dépliables

#### Bénéfices UX

1. **Prédictibilité** : L'utilisateur voit immédiatement la structure complète de la page
2. **Pas de content shifting** : Le layout est stable dès le chargement, pas de réorganisation
3. **Meilleure compréhension** : L'utilisateur sait quelles données seront disponibles
4. **Perception du temps réduite** : L'interface semble plus réactive
5. **Guidance claire** : Les sections grisées indiquent les fonctionnalités à venir

#### Pages Concernées

- `/consumption` - 4 sections always visible (Statistiques, Graphiques, Pics de consommation, Analyse détaillée)
- `/simulator` - Section "Comparaison des offres" always visible

#### Voir aussi

- [11 - États](./11-states.md) - Pour les états disabled/enabled
- [13 - Loading](./13-loading.md) - Pour la progression du chargement

## À ne pas faire

### Icône de mauvaise taille

```tsx
// ❌ INCORRECT - Trop grande
<IconComponent size={32} />

// ✅ CORRECT
<IconComponent size={20} />
```

### Padding inconsistant

```tsx
// ❌ INCORRECT
<div className="p-4">
<div className="px-4 pb-4">

// ✅ CORRECT
<div className="p-6">
<div className="px-6 pb-6">
```

### Pas de dark mode

```tsx
// ❌ INCORRECT
<div className="bg-white border-gray-300">

// ✅ CORRECT
<div className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
```

### Espacement vertical incorrect

```tsx
// ❌ INCORRECT
<div className="px-6 pb-6 space-y-4">

// ✅ CORRECT
<div className="px-6 pb-6 space-y-8">
```

### Chevron sans animation

```tsx
// ❌ INCORRECT
<svg className={`w-5 h-5 ${isExpanded ? "rotate-180" : ""}`}>

// ✅ CORRECT
<svg className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
```

## Voir aussi

- [08 - Cards](./08-cards.md) - Pour les règles de cards générales
- [11 - États](./11-states.md) - Pour les états interactifs
- [06 - Espacement](./06-spacing.md) - Pour les règles d'espacement
