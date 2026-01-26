# Container Principal

## Vue d'ensemble

Le container principal définit l'enveloppe de toutes les pages de l'application. Il assure une cohérence visuelle et un espacement standardisé.

## Règles

1. **TOUJOURS** utiliser `pt-6` (padding-top: 24px) sur le container principal
2. Cet espacement assure une cohérence visuelle entre toutes les pages
3. Format complet : `pt-6 w-full` ou `pt-6 space-y-6 w-full` selon les besoins
4. Exception : Pages avec layout centré (Login, Signup) qui utilisent `min-h-screen flex items-center justify-center`

## Code de référence

### Container Standard

```tsx
<div className="pt-6 w-full">
  {/* Contenu de la page */}
</div>
```

### Container avec Espacement Vertical

```tsx
<div className="pt-6 space-y-6 w-full">
  {/* Les enfants directs auront un espacement vertical de 24px */}
</div>
```

### Exception : Pages Centrées

```tsx
// Pages comme Login, Signup
<div className="min-h-screen flex items-center justify-center">
  <div className="w-full max-w-md">
    {/* Formulaire centré */}
  </div>
</div>
```

## Exemples d'utilisation

### Page Dashboard

```tsx
export default function Dashboard() {
  return (
    <div className="pt-6 w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <LayoutDashboard className="text-primary-600 dark:text-primary-400" size={32} />
          Tableau de bord
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Vue d'ensemble de votre consommation électrique
        </p>
      </div>

      {/* Contenu de la page */}
    </div>
  )
}
```

### Page Consumption

```tsx
export default function Consumption() {
  return (
    <div className="pt-6 w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
          Consommation
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Analysez votre consommation électrique en détail
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {/* Configuration */}
        {/* Statistiques */}
        {/* Graphiques */}
      </div>
    </div>
  )
}
```

## À ne pas faire

### Pas de padding-top différent

```tsx
// ❌ INCORRECT
<div className="pt-4 w-full">
<div className="pt-8 w-full">
<div className="pt-5 w-full">

// ✅ CORRECT
<div className="pt-6 w-full">
```

### Pas de padding latéral

```tsx
// ❌ INCORRECT - Le Layout gère déjà le padding latéral
<div className="pt-6 px-6 w-full">

// ✅ CORRECT
<div className="pt-6 w-full">
```

### Ne pas oublier w-full

```tsx
// ❌ INCORRECT - Risque de width non définie
<div className="pt-6">

// ✅ CORRECT
<div className="pt-6 w-full">
```

## Voir aussi

- [02 - Header de Page](./02-header.md) - Pour structurer le contenu du container
- [03 - Sections](./03-sections.md) - Pour organiser le contenu en sections
- [06 - Espacement](./06-spacing.md) - Pour les règles d'espacement détaillées
