# États de Chargement et Progression

## Vue d'ensemble

Les états de chargement informent l'utilisateur qu'une opération est en cours. Ils sont essentiels pour une bonne expérience utilisateur.

## Règles

1. Toujours utiliser `Loader2` avec `animate-spin` de Lucide React
2. Couleur : `text-primary-600 dark:text-primary-400`
3. Désactiver les interactions pendant le chargement
4. Afficher la progression quand possible
5. Centrer les loaders dans leur conteneur

## Code de référence

### Loading Simple

```tsx
{isLoading && (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
  </div>
)}
```

### Loading avec Message

```tsx
{isLoading && (
  <div className="flex flex-col items-center justify-center py-12 gap-3">
    <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
    <p className="text-gray-600 dark:text-gray-400">Chargement en cours...</p>
  </div>
)}
```

### Bouton Loading

```tsx
<button className="btn btn-primary" disabled={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="animate-spin" size={18} />
      Chargement...
    </>
  ) : (
    <>
      <Download size={18} />
      Télécharger
    </>
  )}
</button>
```

### Loading Inline

```tsx
<div className="flex items-center gap-2">
  <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={16} />
  <span className="text-sm text-gray-600 dark:text-gray-400">
    Récupération des données...
  </span>
</div>
```

## Composant de Progression

### LoadingProgress (Consumption)

Affiche la progression du chargement avec 4 tâches :

```tsx
interface LoadingProgressProps {
  dailyLoading: boolean
  dailyComplete: boolean
  powerLoading: boolean
  powerComplete: boolean
  detailLoading: boolean
  detailComplete: boolean
  hcHpLoading: boolean
  hcHpComplete: boolean
}

export function LoadingProgress(props: LoadingProgressProps) {
  const tasks = [
    { label: 'Quotidien', loading: props.dailyLoading, complete: props.dailyComplete },
    { label: 'Puissance', loading: props.powerLoading, complete: props.powerComplete },
    { label: 'Détaillé', loading: props.detailLoading, complete: props.detailComplete },
    { label: 'HC/HP', loading: props.hcHpLoading, complete: props.hcHpComplete },
  ]

  const completedCount = tasks.filter(t => t.complete).length
  const progress = (completedCount / tasks.length) * 100

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Progression du chargement
      </h2>

      {/* Barre de progression */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-primary-600 dark:bg-primary-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {completedCount} / {tasks.length} tâches terminées
        </p>
      </div>

      {/* Liste des tâches */}
      <div className="space-y-2">
        {tasks.map((task, index) => (
          <div key={index} className="flex items-center gap-2">
            {task.complete ? (
              <CheckCircle className="text-green-600 dark:text-green-400" size={16} />
            ) : task.loading ? (
              <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={16} />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
            )}
            <span className={`text-sm ${
              task.complete 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              {task.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Barre de Progression Simple

```tsx
<div className="w-full">
  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
    <span>Progression</span>
    <span>{Math.round(progress)}%</span>
  </div>
  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
    <div
      className="bg-primary-600 dark:bg-primary-400 h-2 rounded-full transition-all duration-300"
      style={{ width: `${progress}%` }}
    />
  </div>
</div>
```

## Skeleton Loaders

### Skeleton Text

```tsx
<div className="animate-pulse">
  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2" />
  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2" />
</div>
```

### Skeleton Card

```tsx
<div className="card animate-pulse">
  <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-1/3 mb-4" />
  <div className="space-y-2">
    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full" />
    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6" />
    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-4/6" />
  </div>
</div>
```

### Skeleton Tableau

```tsx
<div className="animate-pulse">
  <table className="w-full">
    <thead>
      <tr>
        <th className="p-3">
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-20" />
        </th>
        <th className="p-3">
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-24" />
        </th>
      </tr>
    </thead>
    <tbody>
      {[...Array(5)].map((_, i) => (
        <tr key={i}>
          <td className="p-3">
            <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-32" />
          </td>
          <td className="p-3">
            <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-16" />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## Exemples d'utilisation

### Page en Loading

```tsx
{isLoading ? (
  <div className="flex items-center justify-center min-h-[400px]">
    <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={48} />
  </div>
) : (
  <div>{/* Contenu */}</div>
)}
```

### Section en Loading

```tsx
<div className="card">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
    Statistiques
  </h2>
  {isLoading ? (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
    </div>
  ) : (
    <div>{/* Contenu */}</div>
  )}
</div>
```

### Upload avec Progression

```tsx
<div className="card">
  {isUploading && (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={16} />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Upload en cours...
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-primary-600 dark:bg-primary-400 h-2 rounded-full transition-all duration-300"
          style={{ width: `${uploadProgress}%` }}
        />
      </div>
    </div>
  )}
</div>
```

### Chargement Initial avec Cache

```tsx
const hasCache = /* détection cache */

{isLoading && (
  <div className="card">
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
      <p className="text-gray-600 dark:text-gray-400">
        {hasCache ? 'Mise à jour des données...' : 'Chargement des données...'}
      </p>
    </div>
  </div>
)}
```

## À ne pas faire

### Icône sans animate-spin

```tsx
// ❌ INCORRECT - Icône statique
<Loader2 className="text-primary-600" size={32} />

// ✅ CORRECT
<Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
```

### Bouton loading sans disabled

```tsx
// ❌ INCORRECT - Clickable pendant loading
<button>
  <Loader2 className="animate-spin" size={18} />
  Chargement...
</button>

// ✅ CORRECT
<button disabled>
  <Loader2 className="animate-spin" size={18} />
  Chargement...
</button>
```

### Loading sans couleur dark mode

```tsx
// ❌ INCORRECT
<Loader2 className="animate-spin text-primary-600" size={32} />

// ✅ CORRECT
<Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
```

### Pas de feedback visuel

```tsx
// ❌ INCORRECT - Aucune indication que quelque chose se passe
<button onClick={handleFetch}>Récupérer</button>

// ✅ CORRECT
<button onClick={handleFetch} disabled={isLoading}>
  {isLoading ? (
    <><Loader2 className="animate-spin" size={18} /> Chargement...</>
  ) : (
    <>Récupérer</>
  )}
</button>
```

## Améliorations UX 2025

### Détection du Cache

Depuis janvier 2025, l'application détecte automatiquement si des données sont en cache et affiche immédiatement le composant de progression du chargement.

#### Objectif

Afficher instantanément la progression du chargement si des données sont déjà en cache, améliorant la transparence du système.

#### Algorithme - Page Consumption

Vérifie si des données d'hier sont présentes dans le cache :

```tsx
const hasYesterdayDataInCache = useMemo(() => {
  if (!selectedPDL) return false

  // Calcul de la date d'hier
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  // Vérification du cache détaillé (jour par jour)
  const cacheKey = ['consumptionDetail', selectedPDL, yesterdayStr, yesterdayStr]
  const detailedQuery = queryClient.getQueryData(cacheKey)

  return detailedQuery?.data?.meter_reading?.interval_reading?.length > 0
}, [selectedPDL, queryClient])
```

#### Algorithme - Page Simulator

Échantillonne 7 dates sur les 365 derniers jours :

```tsx
const hasCacheData = useMemo(() => {
  if (!selectedPdl) return false

  // Échantillonnage de 7 dates sur les 365 derniers jours
  let cachedCount = 0
  const today = new Date()

  for (let i = 0; i < 7; i++) {
    const sampleDate = new Date(today)
    sampleDate.setDate(sampleDate.getDate() - (i * 52)) // Tous les 52 jours
    const dateStr = sampleDate.toISOString().split('T')[0]

    const cacheKey = ['consumptionDetail', selectedPdl, dateStr, dateStr]
    const cachedData = queryClient.getQueryData(cacheKey)
    if (cachedData) cachedCount++
  }

  // Si au moins 3 dates sur 7 sont en cache
  return cachedCount >= 3
}, [selectedPdl, queryClient])
```

#### Visibilité du Composant LoadingProgress

Afficher immédiatement si simulation en cours OU données en cache :

```tsx
// Afficher immédiatement si simulation en cours OU données en cache
{(isSimulating || hasCacheData) && (
  <LoadingProgress
    isSimulating={isSimulating}
    progress={simulationProgress}
  />
)}
```

#### Bénéfices UX

1. **Visibilité instantanée** : L'utilisateur voit immédiatement s'il y a des données en cache
2. **Transparence** : Meilleure compréhension de l'état du système
3. **Perception du temps réduite** : Le temps de chargement semble plus court
4. **Feedback immédiat** : Pas d'attente avant de voir la progression

### Composants de Progression Avancés

#### LoadingProgress (Consumption)

Affiche 4 tâches de chargement distinctes :

```tsx
interface LoadingProgressProps {
  dailyLoading: boolean
  dailyComplete: boolean
  powerLoading: boolean
  powerComplete: boolean
  detailLoading: boolean
  detailComplete: boolean
  hcHpLoading: boolean
  hcHpComplete: boolean
}

export function LoadingProgress(props: LoadingProgressProps) {
  const tasks = [
    { label: 'Données quotidiennes (3 ans)', loading: props.dailyLoading, complete: props.dailyComplete },
    { label: 'Puissance maximale (3 ans)', loading: props.powerLoading, complete: props.powerComplete },
    { label: 'Données détaillées (2 ans, 30min)', loading: props.detailLoading, complete: props.detailComplete },
    { label: 'Calcul HC/HP', loading: props.hcHpLoading, complete: props.hcHpComplete },
  ]

  const completedCount = tasks.filter(t => t.complete).length
  const progress = (completedCount / tasks.length) * 100

  return (
    <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={20} />
        Progression du chargement
      </h2>

      {/* Barre de progression globale */}
      <div className="mb-6">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-primary-600 dark:bg-primary-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {completedCount} / {tasks.length} tâches terminées
        </p>
      </div>

      {/* Liste des tâches avec icônes */}
      <div className="space-y-3">
        {tasks.map((task, index) => (
          <div key={index} className="flex items-center gap-2">
            {task.complete ? (
              <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0" size={16} />
            ) : task.loading ? (
              <Loader2 className="animate-spin text-primary-600 dark:text-primary-400 flex-shrink-0" size={16} />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
            )}
            <span className={`text-sm ${
              task.complete
                ? 'text-green-600 dark:text-green-400 font-medium'
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              {task.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

#### SimulatorLoadingProgress

Affiche 2 tâches de chargement pour le simulateur :

```tsx
interface SimulatorLoadingProgressProps {
  isSimulating: boolean
  progress: {
    dataLoading: boolean
    dataComplete: boolean
    calculationLoading: boolean
    calculationComplete: boolean
  }
}

export function SimulatorLoadingProgress({ isSimulating, progress }: SimulatorLoadingProgressProps) {
  const tasks = [
    { label: 'Récupération des données (365 jours)', loading: progress.dataLoading, complete: progress.dataComplete },
    { label: 'Calcul sur toutes les offres', loading: progress.calculationLoading, complete: progress.calculationComplete },
  ]

  const completedCount = tasks.filter(t => t.complete).length
  const progressPercent = (completedCount / tasks.length) * 100

  return (
    <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={20} />
        Simulation en cours
      </h2>

      {/* Barre de progression */}
      <div className="mb-6">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-primary-600 dark:bg-primary-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {completedCount} / {tasks.length} étapes terminées
        </p>
      </div>

      {/* Liste des tâches */}
      <div className="space-y-3">
        {tasks.map((task, index) => (
          <div key={index} className="flex items-center gap-2">
            {task.complete ? (
              <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0" size={16} />
            ) : task.loading ? (
              <Loader2 className="animate-spin text-primary-600 dark:text-primary-400 flex-shrink-0" size={16} />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
            )}
            <span className={`text-sm ${
              task.complete
                ? 'text-green-600 dark:text-green-400 font-medium'
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              {task.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

#### Pattern Commun des Composants de Progression

Structure type pour créer un composant de progression :

```tsx
const tasks = [
  { label: 'Tâche 1', loading: isLoading1, complete: isComplete1 },
  { label: 'Tâche 2', loading: isLoading2, complete: isComplete2 },
]

const completedCount = tasks.filter(t => t.complete).length
const progress = (completedCount / tasks.length) * 100

// Barre de progression
<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
  <div
    className="bg-primary-600 dark:bg-primary-400 h-2 rounded-full transition-all duration-300"
    style={{ width: `${progress}%` }}
  />
</div>

// Liste des tâches avec icônes
{tasks.map((task) => (
  <div className="flex items-center gap-2">
    {task.complete ? (
      <CheckCircle className="text-green-600 dark:text-green-400" size={16} />
    ) : task.loading ? (
      <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={16} />
    ) : (
      <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
    )}
    <span>{task.label}</span>
  </div>
))}
```

#### Icônes d'État des Tâches

- **Complète** : `<CheckCircle />` en vert
- **En cours** : `<Loader2 className="animate-spin" />` en primary
- **En attente** : Cercle vide avec bordure grise

#### Fichiers de Référence

- `/apps/web/src/pages/Consumption/components/LoadingProgress.tsx`
- `/apps/web/src/pages/Simulator/SimulatorLoadingProgress.tsx`

#### Voir aussi

- [03 - Sections](./03-sections.md) - Pour les sections always visible
- [11 - États](./11-states.md) - Pour les états conditionnels

## Voir aussi

- [10 - Icônes](./10-icons.md) - Pour l'icône Loader2
- [11 - États](./11-states.md) - Pour l'état disabled
- [07 - Boutons](./07-buttons.md) - Pour les boutons loading
