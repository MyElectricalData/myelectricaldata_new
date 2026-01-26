# Statistiques Euro (ConsumptionEuro)

## Vue d'ensemble

La page `/consumption_euro` affiche les coûts de consommation électrique calculés à partir des données Enedis et des tarifs des offres. Elle utilise plusieurs composants visuels spécifiques pour présenter les statistiques annuelles et mensuelles.

## Composants

### 1. Year Stats Cards (Cartes d'années)

Cartes non-cliquables affichant les statistiques annuelles avec une bordure colorée correspondant à la couleur du graphique.

#### Règles

1. Layout : `grid grid-cols-2 gap-4`
2. Card : `p-4 rounded-xl border-2 shadow-lg`
3. Fond : En dark mode `${color.main}20`, en light mode `color.light`
4. Bordure : Couleur du graphique correspondant à l'année
5. Titre année : `text-lg font-bold` avec couleur du graphique
6. Indicateur coloré : `w-3 h-3 rounded-full` avec couleur du graphique
7. Période : `text-xs text-gray-500 dark:text-gray-400 mb-3`
8. Coût total : `text-2xl font-bold text-gray-900 dark:text-gray-100`
9. kWh : `text-sm text-gray-600 dark:text-gray-400`
10. Moyenne mensuelle : `text-xs text-gray-500 dark:text-gray-400`

#### Couleurs des années

```tsx
const YEAR_COLORS = [
  { main: '#10b981', light: '#d1fae5' }, // Green - Année 1
  { main: '#6366f1', light: '#e0e7ff' }, // Indigo - Année 2
  { main: '#f59e0b', light: '#fef3c7' }, // Amber - Année 3
  { main: '#ec4899', light: '#fce7f3' }, // Pink - Année 4
]
```

#### Code de référence

```tsx
<div className="grid grid-cols-2 gap-4">
  {yearlyCosts.map((year, idx) => {
    const color = YEAR_COLORS[idx % YEAR_COLORS.length]

    return (
      <div
        key={year.year}
        className="p-4 rounded-xl border-2 shadow-lg"
        style={{
          backgroundColor: isDarkMode ? `${color.main}20` : color.light,
          borderColor: color.main,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-lg font-bold"
            style={{ color: color.main }}
          >
            {year.year}
          </span>
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color.main }}
          />
        </div>

        {/* Period */}
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {year.periodLabel}
        </div>

        {/* Total cost */}
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          {formatCurrency(year.totalCost)}
        </div>

        {/* kWh */}
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {Math.round(year.totalKwh).toLocaleString('fr-FR')} kWh
        </div>

        {/* Monthly average */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Moy. {formatCurrency(year.avgMonthlyCost)}/mois
        </div>
      </div>
    )
  })}
</div>
```

### 2. Year-over-Year Comparison Badges

Badges affichant la différence entre deux années consécutives.

#### Règles

1. Container : `flex flex-wrap gap-3 justify-center`
2. Badge positif (augmentation) : `bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300`
3. Badge négatif (économie) : `bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300`
4. Badge kWh positif : `bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300`
5. Badge kWh négatif : `bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300`
6. Style : `inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium`
7. Pourcentage : `opacity-70`

#### Code de référence

```tsx
{yoyDiff && (
  <div className="flex flex-wrap gap-3 justify-center">
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
      yoyDiff.cost > 0
        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
    }`}>
      <span>{yoyDiff.cost > 0 ? '+' : ''}{formatCurrency(yoyDiff.cost)}</span>
      <span className="opacity-70">({yoyDiff.costPercent > 0 ? '+' : ''}{yoyDiff.costPercent.toFixed(1)}%)</span>
    </div>
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
      yoyDiff.kwh > 0
        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
    }`}>
      <span>{yoyDiff.kwh > 0 ? '+' : ''}{Math.round(yoyDiff.kwh).toLocaleString('fr-FR')} kWh</span>
      <span className="opacity-70">({yoyDiff.kwhPercent > 0 ? '+' : ''}{yoyDiff.kwhPercent.toFixed(1)}%)</span>
    </div>
  </div>
)}
```

### 3. Monthly Breakdown Table

Tableau affichant le détail mensuel des coûts, trié du mois le plus récent au plus ancien.

#### Règles

1. Container : `overflow-x-auto`
2. Table : `w-full text-xs`
3. Header : `bg-gray-50 dark:bg-gray-800/50`
4. Header cells : `text-left py-2 px-2 text-gray-500 dark:text-gray-400`
5. Body rows : `border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30`
6. Valeurs HC : `text-purple-600 dark:text-purple-400`
7. Valeurs HP : `text-pink-600 dark:text-pink-400`
8. Total row : `bg-primary-50 dark:bg-primary-900/20 font-semibold`
9. **Tri des mois** : Du plus récent au plus ancien avec `[...year.months].reverse()`

#### Code de référence

```tsx
<div className="overflow-x-auto">
  <table className="w-full text-xs">
    <thead>
      <tr className="bg-gray-50 dark:bg-gray-800/50">
        <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">Mois</th>
        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">Total kWh</th>
        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">HC kWh</th>
        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">HP kWh</th>
        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">Coût Conso</th>
        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">Abo</th>
        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">Total</th>
      </tr>
    </thead>
    <tbody>
      {[...year.months].reverse().map(month => (
        <tr
          key={month.month}
          className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30"
        >
          <td className="py-2 px-2 text-gray-900 dark:text-gray-100">{month.monthLabel}</td>
          <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">{Math.round(month.totalKwh)}</td>
          <td className="py-2 px-2 text-right text-purple-600 dark:text-purple-400">{Math.round(month.hcKwh)}</td>
          <td className="py-2 px-2 text-right text-pink-600 dark:text-pink-400">{Math.round(month.hpKwh)}</td>
          <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(month.consumptionCost)}</td>
          <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(month.subscriptionCost)}</td>
          <td className="py-2 px-2 text-right font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(month.totalCost)}</td>
        </tr>
      ))}
    </tbody>
    <tfoot>
      <tr className="bg-primary-50 dark:bg-primary-900/20 font-semibold">
        <td className="py-2 px-2 text-primary-900 dark:text-primary-100">Total</td>
        {/* ... totaux ... */}
      </tr>
    </tfoot>
  </table>
</div>
```

### 4. Info Block

Bloc d'informations collapsible avec avertissements et explications.

#### Règles

1. Card : `mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700`
2. Header : `flex items-center justify-between p-6 cursor-pointer`
3. Icône : `Info` de lucide-react avec `text-primary-600 dark:text-primary-400 size={20}`
4. Titre : `text-lg font-semibold text-gray-900 dark:text-white`
5. Content : `px-6 pb-6 space-y-4`
6. Bloc warning (orange) : `bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4`
7. Bloc info (bleu) : `bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4`
8. Bloc success (vert) : `bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4`
9. Bloc note (jaune) : `bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4`

#### Code de référence

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
  {/* Header cliquable */}
  <div
    className="flex items-center justify-between p-6 cursor-pointer"
    onClick={onToggle}
  >
    <div className="flex items-center gap-2">
      <Info className="text-primary-600 dark:text-primary-400" size={20} />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Informations importantes
      </h3>
    </div>
    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
      {isExpanded ? (
        <span className="text-sm">Réduire</span>
      ) : (
        <span className="text-sm">Développer</span>
      )}
      <svg
        className={`w-5 h-5 transition-transform duration-200 ${
          isExpanded ? 'rotate-180' : ''
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>

  {/* Contenu */}
  {isExpanded && (
    <div className="px-6 pb-6 space-y-4">
      {/* Cache Warning */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
        <p className="text-sm text-orange-800 dark:text-orange-200">
          <strong>💾 Cache automatique :</strong> L'utilisation de cette page entraîne un stockage temporaire...
        </p>
      </div>

      {/* Calculation Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <p><strong>💶 Calcul des coûts :</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Point 1</li>
            <li>Point 2</li>
          </ul>
        </div>
      </div>
    </div>
  )}
</div>
```

## Format des devises

```tsx
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}
```

Pour les tableaux détaillés, utiliser 2 décimales :

```tsx
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}
```

## Voir aussi

- [03 - Sections](./03-sections.md) - Pour les sections collapsibles
- [08 - Cards](./08-cards.md) - Pour les cards standard
- [04 - Couleurs](./04-colors.md) - Pour les couleurs sémantiques
- [14 - Dark Mode](./14-dark-mode.md) - Pour les variantes dark mode
