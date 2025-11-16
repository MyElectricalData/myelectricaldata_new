# Filtres et Tri

## Vue d'ensemble

Les filtres et le tri permettent aux utilisateurs de manipuler et d'organiser les données. Ils suivent un pattern compact et cohérent inspiré d'AdminUsers.

## Règles

1. Fond : `bg-gray-50 dark:bg-gray-900/30`
2. Bordure : `border border-gray-200 dark:border-gray-700`
3. Padding : `p-3`
4. Gap entre éléments : `gap-3`
5. Labels : `text-xs text-gray-600 dark:text-gray-400`
6. Selects : `input text-xs py-1 px-2 w-auto`
7. Checkboxes : `w-3 h-3` pour garder une taille compacte
8. Bouton réinitialiser : `ml-auto` pour aligner à droite

## Code de référence

### Barre de Filtres Standard

```tsx
<div className="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700">
  <div className="flex items-center gap-2">
    <Filter size={16} className="text-gray-500" />
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
      Filtres:
    </span>
  </div>

  <div className="flex items-center gap-2">
    <label className="text-xs text-gray-600 dark:text-gray-400">
      Catégorie:
    </label>
    <select
      value={filterValue}
      onChange={(e) => setFilterValue(e.target.value)}
      className="input text-xs py-1 px-2 w-auto"
    >
      <option value="all">Tous</option>
      <option value="category1">Catégorie 1</option>
      <option value="category2">Catégorie 2</option>
    </select>
  </div>

  {/* Bouton de réinitialisation si filtres actifs */}
  {filterValue !== 'all' && (
    <button
      onClick={() => setFilterValue('all')}
      className="text-xs text-primary-600 dark:text-primary-400 hover:underline ml-auto"
    >
      Réinitialiser
    </button>
  )}
</div>
```

### Filtre avec Checkbox

```tsx
<div className="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700">
  <div className="flex items-center gap-2">
    <Filter size={16} className="text-gray-500" />
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
      Filtres:
    </span>
  </div>

  <div className="flex items-center gap-2">
    <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-600 dark:text-gray-400">
      <input
        type="checkbox"
        checked={showOnlyRecent}
        onChange={(e) => setShowOnlyRecent(e.target.checked)}
        className="w-3 h-3 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
      />
      <span>Récentes uniquement</span>
    </label>
  </div>
</div>
```

## Tri dans les Tableaux

### Header de Colonne Triable

```tsx
<th
  className="
    p-3 text-right font-semibold cursor-pointer
    hover:bg-gray-200 dark:hover:bg-gray-700
    transition-colors
    select-none
  "
  onClick={() => handleSort('columnName')}
  title="Cliquez pour trier"
>
  <div className="flex items-center justify-end gap-1">
    <span>Nom de la Colonne</span>
    {getSortIcon('columnName')}
  </div>
</th>
```

### Fonction getSortIcon

```tsx
const getSortIcon = (column: string) => {
  if (sortBy !== column) {
    return <ArrowUpDown size={14} className="opacity-40" />
  }
  return sortOrder === 'asc' ? (
    <ArrowUp size={14} />
  ) : (
    <ArrowDown size={14} />
  )
}
```

### Logique de Tri

```tsx
const [sortBy, setSortBy] = useState<'column1' | 'column2'>('column1')
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

const handleSort = (column: 'column1' | 'column2') => {
  if (sortBy === column) {
    // Toggle sort order si même colonne
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
  } else {
    // Nouvelle colonne, défaut ascendant
    setSortBy(column)
    setSortOrder('asc')
  }
}

const filteredAndSortedData = useMemo(() => {
  let filtered = [...data]

  // Appliquer filtres
  if (filterValue !== 'all') {
    filtered = filtered.filter(item => item.category === filterValue)
  }

  // Appliquer tri
  filtered.sort((a, b) => {
    const comparison = a[sortBy] - b[sortBy]  // Pour nombres
    // Pour strings : a[sortBy].localeCompare(b[sortBy])
    return sortOrder === 'asc' ? comparison : -comparison
  })

  return filtered
}, [data, filterValue, sortBy, sortOrder])
```

## Exemples d'utilisation

### Filtre "Récentes uniquement" (Simulateur)

Dans le simulateur de tarifs, le filtre permet de masquer les offres dont les tarifs datent de plus de 6 mois.

```tsx
// Helper function
function isOldTariff(validFrom: string | undefined): boolean {
  if (!validFrom) return false
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  return new Date(validFrom) < sixMonthsAgo
}

// Filtrage
if (showOnlyRecent) {
  filtered = filtered.filter((result) => !isOldTariff(result.validFrom))
}

// Badge dans l'UI
{isOldTariff(offer.validFrom) && (
  <span
    className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded font-semibold"
    title="Tarif ancien (> 6 mois) - Potentiellement non à jour"
  >
    ⚠️ Ancien
  </span>
)}
```

### Filtres Multiples

```tsx
<div className="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700">
  <div className="flex items-center gap-2">
    <Filter size={16} className="text-gray-500" />
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
      Filtres:
    </span>
  </div>

  {/* Filtre par statut */}
  <div className="flex items-center gap-2">
    <label className="text-xs text-gray-600 dark:text-gray-400">
      Statut:
    </label>
    <select
      value={statusFilter}
      onChange={(e) => setStatusFilter(e.target.value)}
      className="input text-xs py-1 px-2 w-auto"
    >
      <option value="all">Tous</option>
      <option value="active">Actifs</option>
      <option value="inactive">Inactifs</option>
    </select>
  </div>

  {/* Filtre par type */}
  <div className="flex items-center gap-2">
    <label className="text-xs text-gray-600 dark:text-gray-400">
      Type:
    </label>
    <select
      value={typeFilter}
      onChange={(e) => setTypeFilter(e.target.value)}
      className="input text-xs py-1 px-2 w-auto"
    >
      <option value="all">Tous</option>
      <option value="type1">Type 1</option>
      <option value="type2">Type 2</option>
    </select>
  </div>

  {/* Checkbox */}
  <div className="flex items-center gap-2">
    <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-600 dark:text-gray-400">
      <input
        type="checkbox"
        checked={showOnlyFavorites}
        onChange={(e) => setShowOnlyFavorites(e.target.checked)}
        className="w-3 h-3 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
      />
      <span>Favoris uniquement</span>
    </label>
  </div>

  {/* Bouton réinitialiser */}
  {(statusFilter !== 'all' || typeFilter !== 'all' || showOnlyFavorites) && (
    <button
      onClick={() => {
        setStatusFilter('all')
        setTypeFilter('all')
        setShowOnlyFavorites(false)
      }}
      className="text-xs text-primary-600 dark:text-primary-400 hover:underline ml-auto"
    >
      Réinitialiser
    </button>
  )}
</div>
```

### Tableau Complet avec Tri

```tsx
<table className="w-full">
  <thead className="bg-gray-100 dark:bg-gray-700">
    <tr>
      <th
        className="p-3 text-left font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors select-none"
        onClick={() => handleSort('name')}
      >
        <div className="flex items-center gap-1">
          <span>Nom</span>
          {getSortIcon('name')}
        </div>
      </th>
      <th
        className="p-3 text-right font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors select-none"
        onClick={() => handleSort('value')}
      >
        <div className="flex items-center justify-end gap-1">
          <span>Valeur</span>
          {getSortIcon('value')}
        </div>
      </th>
    </tr>
  </thead>
  <tbody>
    {filteredAndSortedData.map((item) => (
      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
        <td className="p-3">{item.name}</td>
        <td className="p-3 text-right">{item.value}</td>
      </tr>
    ))}
  </tbody>
</table>
```

## À ne pas faire

### Filtres sans fond

```tsx
// ❌ INCORRECT
<div className="flex gap-3 p-3">

// ✅ CORRECT
<div className="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700">
```

### Labels trop grands

```tsx
// ❌ INCORRECT
<label className="text-sm font-medium">Catégorie:</label>

// ✅ CORRECT
<label className="text-xs text-gray-600 dark:text-gray-400">Catégorie:</label>
```

### Tri sans icône

```tsx
// ❌ INCORRECT
<th onClick={() => handleSort('name')}>Nom</th>

// ✅ CORRECT
<th className="cursor-pointer" onClick={() => handleSort('name')}>
  <div className="flex items-center gap-1">
    <span>Nom</span>
    {getSortIcon('name')}
  </div>
</th>
```

### Pas de bouton réinitialiser

```tsx
// ❌ INCORRECT - Utilisateur ne peut pas revenir à l'état initial

// ✅ CORRECT
{filterValue !== 'all' && (
  <button onClick={() => setFilterValue('all')}>
    Réinitialiser
  </button>
)}
```

## Voir aussi

- [09 - Formulaires](./09-forms.md) - Pour les selects et checkboxes
- [10 - Icônes](./10-icons.md) - Pour les icônes de tri
- [05 - Typographie](./05-typography.md) - Pour les tailles de texte
