# Exemples de Code Complets

## Vue d'ensemble

Ce document contient des exemples de code complets pour différents types de pages et composants.

## Page Simple

```tsx
import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="pt-6 w-full">
      {/* Header de page */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Settings className="text-primary-600 dark:text-primary-400" size={32} />
          Paramètres
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gérez vos préférences et votre compte
        </p>
      </div>

      {/* Section de configuration */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Informations du compte
        </h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="votre@email.com"
            />
          </div>
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Nom complet
            </label>
            <input
              id="name"
              type="text"
              className="input"
              placeholder="Jean Dupont"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-2 justify-end">
        <button className="btn btn-secondary">Annuler</button>
        <button className="btn btn-primary">Enregistrer</button>
      </div>
    </div>
  )
}
```

## Page avec Sections Collapsibles

```tsx
import { useState } from 'react'
import { BarChart3, TrendingUp } from 'lucide-react'

export default function StatsPage() {
  const [isStatsExpanded, setIsStatsExpanded] = useState(false)
  const [isChartsExpanded, setIsChartsExpanded] = useState(false)
  const [allLoadingComplete, setAllLoadingComplete] = useState(true)

  return (
    <div className="pt-6 w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <BarChart3 className="text-primary-600 dark:text-primary-400" size={32} />
          Statistiques
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Visualisez vos données
        </p>
      </div>

      {/* Section Statistiques */}
      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
        <div
          className={`flex items-center justify-between p-6 ${
            allLoadingComplete ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
          }`}
          onClick={() => {
            if (allLoadingComplete) {
              setIsStatsExpanded(!isStatsExpanded)
            }
          }}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="text-primary-600 dark:text-primary-400" size={20} />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Statistiques globales
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
                isStatsExpanded ? 'rotate-180' : ''
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  1,234 kWh
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Moyenne</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  41.1 kWh/jour
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Coût</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  185.12 €
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section Graphiques */}
      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
        <div
          className={`flex items-center justify-between p-6 ${
            allLoadingComplete ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
          }`}
          onClick={() => {
            if (allLoadingComplete) {
              setIsChartsExpanded(!isChartsExpanded)
            }
          }}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Graphiques
            </h2>
          </div>

          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            {isChartsExpanded ? (
              <span className="text-sm">Réduire</span>
            ) : (
              <span className="text-sm">Développer</span>
            )}
            <svg
              className={`w-5 h-5 transition-transform duration-200 ${
                isChartsExpanded ? 'rotate-180' : ''
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

        {isChartsExpanded && allLoadingComplete && (
          <div className="px-6 pb-6 space-y-8">
            {/* Graphiques ici */}
            <div className="h-64 flex items-center justify-center bg-gray-50 dark:bg-gray-900/30 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400">Graphique</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

## Page avec Loading et Empty State

```tsx
import { useState, useEffect } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'

export default function DataPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    // Simuler un chargement
    setTimeout(() => {
      setIsLoading(false)
      // setData([...]) pour afficher des données
    }, 2000)
  }, [])

  return (
    <div className="pt-6 w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
          Mes Données
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Consultez vos données
        </p>
      </div>

      {/* Contenu avec états */}
      <div className="card">
        {isLoading ? (
          // État Loading
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
            <p className="text-gray-600 dark:text-gray-400">
              Chargement des données...
            </p>
          </div>
        ) : !data ? (
          // Empty State
          <div className="p-12 text-center">
            <TrendingUp className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Aucune donnée disponible
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Commencez par récupérer vos données
            </p>
            <button className="btn btn-primary">
              Récupérer les données
            </button>
          </div>
        ) : (
          // Données affichées
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Résultats
            </h2>
            {/* Affichage des données */}
          </div>
        )}
      </div>
    </div>
  )
}
```

## Page avec Formulaire Complet

```tsx
import { useState } from 'react'
import { Save, X } from 'lucide-react'

export default function FormPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    country: '',
    newsletter: false,
  })
  const [errors, setErrors] = useState({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Validation
    const newErrors = {}
    if (!formData.email) newErrors.email = 'Email requis'
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setIsSubmitting(false)
      return
    }

    try {
      // Soumission du formulaire
      await new Promise(resolve => setTimeout(resolve, 1000))
      // Success
    } catch (error) {
      // Error handling
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="pt-6 w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Save className="text-primary-600 dark:text-primary-400" size={32} />
          Formulaire
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Remplissez vos informations
        </p>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit}>
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Informations personnelles
          </h2>

          <div className="space-y-4">
            {/* Prénom + Nom */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Prénom
                </label>
                <input
                  id="firstName"
                  type="text"
                  className="input"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Nom
                </label>
                <input
                  id="lastName"
                  type="text"
                  className="input"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                className={`input ${errors.email ? 'border-red-500 dark:border-red-500' : ''}`}
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value })
                  if (errors.email) setErrors({ ...errors, email: undefined })
                }}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                required
              />
              {errors.email && (
                <p id="email-error" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Pays */}
            <div>
              <label
                htmlFor="country"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Pays
              </label>
              <select
                id="country"
                className="input"
                value={formData.country}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
                required
              >
                <option value="">Sélectionnez un pays</option>
                <option value="FR">France</option>
                <option value="BE">Belgique</option>
                <option value="CH">Suisse</option>
              </select>
            </div>

            {/* Newsletter */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="newsletter"
                className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                checked={formData.newsletter}
                onChange={(e) =>
                  setFormData({ ...formData, newsletter: e.target.checked })
                }
              />
              <label
                htmlFor="newsletter"
                className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                S'abonner à la newsletter
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-end">
          <button
            type="button"
            className="btn btn-secondary w-full sm:w-auto"
            disabled={isSubmitting}
          >
            <X size={18} />
            Annuler
          </button>
          <button
            type="submit"
            className="btn btn-primary w-full sm:w-auto"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Enregistrement...
              </>
            ) : (
              <>
                <Save size={18} />
                Enregistrer
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
```

## Page avec Tableau et Filtres

```tsx
import { useState, useMemo } from 'react'
import { Filter, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

export default function TablePage() {
  const [data] = useState([
    { id: 1, name: 'Item 1', value: 100, category: 'A' },
    { id: 2, name: 'Item 2', value: 200, category: 'B' },
    { id: 3, name: 'Item 3', value: 150, category: 'A' },
  ])

  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'name' | 'value'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = (column: 'name' | 'value') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown size={14} className="opacity-40" />
    }
    return sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
  }

  const filteredAndSortedData = useMemo(() => {
    let filtered = [...data]

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((item) => item.category === categoryFilter)
    }

    filtered.sort((a, b) => {
      const comparison = sortBy === 'name'
        ? a.name.localeCompare(b.name)
        : a.value - b.value
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [data, categoryFilter, sortBy, sortOrder])

  return (
    <div className="pt-6 w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Tableau</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Données avec filtres et tri
        </p>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input text-xs py-1 px-2 w-auto"
          >
            <option value="all">Toutes</option>
            <option value="A">Catégorie A</option>
            <option value="B">Catégorie B</option>
          </select>
        </div>

        {categoryFilter !== 'all' && (
          <button
            onClick={() => setCategoryFilter('all')}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline ml-auto"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      <div className="card overflow-x-auto">
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
              <th className="p-3 text-left font-semibold">Catégorie</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedData.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
              >
                <td className="p-3 text-gray-900 dark:text-white">
                  {item.name}
                </td>
                <td className="p-3 text-right text-gray-900 dark:text-white">
                  {item.value}
                </td>
                <td className="p-3 text-gray-600 dark:text-gray-400">
                  {item.category}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

## Voir aussi

- [Checklist](./checklist.md) - Pour vérifier tous les points
- [Composants](./components/README.md) - Pour les détails de chaque composant
- [Design Guidelines](./design-guidelines.md) - Pour le guide complet
- Améliorations UX 2025 :
  - [03 - Sections](./components/03-sections.md) - Pattern "Always Visible"
  - [11 - États](./components/11-states.md) - États conditionnels
  - [13 - Loading](./components/13-loading.md) - Détection cache et progression
