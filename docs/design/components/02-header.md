# Header de Page

## Vue d'ensemble

Le header de page définit le titre principal (H1) avec son icône et son sous-titre. C'est le premier élément visible après le container principal.

## Règles

1. H1 : `text-3xl font-bold mb-2 flex items-center gap-3`
2. Icône : `text-primary-600 dark:text-primary-400` avec `size={32}`
3. Sous-titre : `text-gray-600 dark:text-gray-400`
4. Espacement : `mb-6` après l'en-tête complet
5. L'icône doit être pertinente et représenter la page

## Code de référence

### Structure Standard

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
    <IconComponent className="text-primary-600 dark:text-primary-400" size={32} />
    Titre de la Page
  </h1>
  <p className="text-gray-600 dark:text-gray-400">
    Description de la page
  </p>
</div>
```

## Exemples d'utilisation

### Page Consumption

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
    <TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
    Consommation
  </h1>
  <p className="text-gray-600 dark:text-gray-400">
    Analysez votre consommation électrique en détail
  </p>
</div>
```

### Page Settings

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
    <Settings className="text-primary-600 dark:text-primary-400" size={32} />
    Paramètres
  </h1>
  <p className="text-gray-600 dark:text-gray-400">
    Gérez vos préférences et votre compte
  </p>
</div>
```

### Page Admin Users

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
    <Users className="text-primary-600 dark:text-primary-400" size={32} />
    Gestion des utilisateurs
  </h1>
  <p className="text-gray-600 dark:text-gray-400">
    Gérez les comptes utilisateurs et leurs permissions
  </p>
</div>
```

### Page Simulator

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
    <Calculator className="text-primary-600 dark:text-primary-400" size={32} />
    Simulateur de tarifs
  </h1>
  <p className="text-gray-600 dark:text-gray-400">
    Comparez les offres d'électricité et estimez vos économies
  </p>
</div>
```

### Header sans Sous-titre

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
    <BarChart3 className="text-primary-600 dark:text-primary-400" size={32} />
    Statistiques
  </h1>
</div>
```

## À ne pas faire

### Taille d'icône incorrecte

```tsx
// ❌ INCORRECT
<TrendingUp className="text-primary-600 dark:text-primary-400" size={20} />
<TrendingUp className="text-primary-600 dark:text-primary-400" size={24} />

// ✅ CORRECT
<TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
```

### Couleur sans dark mode

```tsx
// ❌ INCORRECT
<TrendingUp className="text-primary-600" size={32} />

// ✅ CORRECT
<TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
```

### Gap incorrect

```tsx
// ❌ INCORRECT
<h1 className="text-3xl font-bold mb-2 flex items-center gap-2">

// ✅ CORRECT
<h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
```

### Taille de titre incorrecte

```tsx
// ❌ INCORRECT
<h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
<h1 className="text-4xl font-bold mb-2 flex items-center gap-3">

// ✅ CORRECT
<h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
```

### Sous-titre sans dark mode

```tsx
// ❌ INCORRECT
<p className="text-gray-600">Description</p>

// ✅ CORRECT
<p className="text-gray-600 dark:text-gray-400">Description</p>
```

## Icônes Recommandées par Page

| Page | Icône | Import |
|------|-------|--------|
| Dashboard | LayoutDashboard | `lucide-react` |
| Consumption | TrendingUp | `lucide-react` |
| Production | Zap | `lucide-react` |
| Simulator | Calculator | `lucide-react` |
| Settings | Settings | `lucide-react` |
| Admin Users | Users | `lucide-react` |
| Admin Logs | FileText | `lucide-react` |
| Admin Contributions | Gift | `lucide-react` |
| Ecowatt | Activity | `lucide-react` |
| Tempo | Calendar | `lucide-react` |
| FAQ | HelpCircle | `lucide-react` |
| API Docs | Code | `lucide-react` |

## Voir aussi

- [01 - Container](./01-container.md) - Pour le container parent
- [05 - Typographie](./05-typography.md) - Pour les règles de typographie
- [10 - Icônes](./10-icons.md) - Pour les règles d'icônes détaillées
- [04 - Couleurs](./04-colors.md) - Pour la palette de couleurs
