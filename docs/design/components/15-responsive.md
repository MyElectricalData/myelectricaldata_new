# Responsive Design

## Vue d'ensemble

Le design responsive assure que l'interface fonctionne sur tous les appareils, du mobile au desktop. On utilise une approche mobile-first.

## Règles

1. Approche mobile-first : concevoir d'abord pour mobile
2. Utiliser les breakpoints Tailwind standard
3. Tester sur plusieurs tailles d'écran
4. Les tableaux deviennent des cards sur mobile
5. Les grids s'adaptent en colonnes

## Breakpoints Tailwind

```css
sm: 640px   /* Small devices - Tablettes portrait */
md: 768px   /* Medium devices - Tablettes landscape */
lg: 1024px  /* Large devices - Desktop */
xl: 1280px  /* Extra large devices - Large desktop */
2xl: 1536px /* 2X Extra large */
```

## Code de référence

### Layout Flex

```tsx
{/* Mobile: colonne, Desktop: ligne */}
<div className="flex flex-col md:flex-row gap-4">
  <div>Élément 1</div>
  <div>Élément 2</div>
</div>
```

### Grid Responsive

```tsx
{/* Mobile: 1 col, Tablette: 2 cols, Desktop: 3 cols */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>
```

### Padding Responsive

```tsx
<div className="p-4 md:p-6 lg:p-8">
  Contenu avec padding adaptatif
</div>
```

### Text Size Responsive

```tsx
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">
  Titre responsive
</h1>
```

### Hide/Show Elements

```tsx
{/* Caché sur mobile, visible sur desktop */}
<div className="hidden md:block">
  Navigation desktop
</div>

{/* Visible sur mobile, caché sur desktop */}
<div className="block md:hidden">
  Menu hamburger
</div>
```

## Exemples d'utilisation

### Header de Page Responsive

```tsx
<div className="mb-6">
  <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2 md:gap-3">
    <TrendingUp
      className="text-primary-600 dark:text-primary-400"
      size={24}
      className="md:size-32"
    />
    Consommation
  </h1>
  <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">
    Analysez votre consommation électrique
  </p>
</div>
```

### Grid de Statistiques

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <div className="card">
    <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
    <p className="text-2xl font-bold text-gray-900 dark:text-white">
      1,234 kWh
    </p>
  </div>
  {/* Autres stats */}
</div>
```

### Formulaire Responsive

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>
    <label className="block text-sm font-medium mb-1">Prénom</label>
    <input type="text" className="input" />
  </div>
  <div>
    <label className="block text-sm font-medium mb-1">Nom</label>
    <input type="text" className="input" />
  </div>
</div>
```

### Tableau Responsive (Table to Cards)

```tsx
{/* Desktop : Tableau */}
<div className="hidden md:block">
  <table className="w-full">
    <thead>
      <tr>
        <th>Date</th>
        <th>Consommation</th>
        <th>Coût</th>
      </tr>
    </thead>
    <tbody>
      {data.map((item) => (
        <tr key={item.id}>
          <td>{item.date}</td>
          <td>{item.consumption}</td>
          <td>{item.cost}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

{/* Mobile : Cards */}
<div className="block md:hidden space-y-4">
  {data.map((item) => (
    <div key={item.id} className="card">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Date</span>
        <span className="text-sm font-medium">{item.date}</span>
      </div>
      <div className="flex justify-between mb-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Consommation</span>
        <span className="text-sm font-medium">{item.consumption}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-gray-600 dark:text-gray-400">Coût</span>
        <span className="text-sm font-medium">{item.cost}</span>
      </div>
    </div>
  ))}
</div>
```

### Sidebar Responsive

```tsx
<div className="flex flex-col md:flex-row">
  {/* Sidebar */}
  <aside className="
    w-full md:w-64
    mb-4 md:mb-0 md:mr-6
  ">
    Navigation
  </aside>

  {/* Contenu principal */}
  <main className="flex-1">
    Contenu
  </main>
</div>
```

### Boutons Responsive

```tsx
<div className="flex flex-col sm:flex-row gap-2">
  <button className="btn btn-secondary w-full sm:w-auto">
    Annuler
  </button>
  <button className="btn btn-primary w-full sm:w-auto">
    Enregistrer
  </button>
</div>
```

### Container Max Width

```tsx
<div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  Contenu centré avec padding responsive
</div>
```

## Patterns Courants

### Stack to Row

```tsx
<div className="flex flex-col lg:flex-row gap-4">
  {/* Empilé verticalement sur mobile, horizontal sur desktop */}
</div>
```

### Grid Auto-Fill

```tsx
<div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
  {/* Nombre de colonnes automatique selon la largeur */}
</div>
```

### Aspect Ratio Responsive

```tsx
<div className="aspect-video md:aspect-square">
  {/* 16:9 sur mobile, 1:1 sur desktop */}
</div>
```

## À ne pas faire

### Breakpoints non standard

```tsx
// ❌ INCORRECT
<div className="max-w-[850px]">

// ✅ CORRECT
<div className="max-w-7xl">
```

### Oublier mobile

```tsx
// ❌ INCORRECT - Seulement desktop
<div className="grid-cols-3 gap-4">

// ✅ CORRECT - Mobile first
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
```

### Tailles fixes

```tsx
// ❌ INCORRECT
<div style={{width: '800px'}}>

// ✅ CORRECT
<div className="w-full max-w-4xl">
```

### Texte trop petit sur mobile

```tsx
// ❌ INCORRECT
<p className="text-xs">Texte illisible sur mobile</p>

// ✅ CORRECT
<p className="text-sm md:text-xs">Texte adapté</p>
```

## Test Responsive

### Checklist

- [ ] Tester sur mobile (375px - iPhone SE)
- [ ] Tester sur tablette portrait (768px)
- [ ] Tester sur tablette landscape (1024px)
- [ ] Tester sur desktop (1280px+)
- [ ] Vérifier les marges/padding
- [ ] Vérifier que le texte est lisible
- [ ] Vérifier que les boutons sont cliquables
- [ ] Tester la navigation
- [ ] Vérifier le scroll horizontal (ne doit pas exister)
- [ ] Tester l'orientation (portrait/landscape)

### Outils de Test

1. DevTools Chrome/Firefox (responsive mode)
2. Test sur vrais appareils
3. BrowserStack ou similaire
4. Test avec `w-screen` pour vérifier le débordement

## Voir aussi

- [01 - Container](./01-container.md) - Pour le container principal
- [06 - Espacement](./06-spacing.md) - Pour l'espacement responsive
- [08 - Cards](./08-cards.md) - Pour les cards responsive
- [05 - Typographie](./05-typography.md) - Pour la taille de texte responsive
