# Améliorations UX - Janvier 2025

## Vue d'ensemble

Ce document détaille les améliorations apportées à l'expérience utilisateur des pages `/consumption` et `/simulator` pour améliorer la visibilité et l'accessibilité des fonctionnalités.

## Date de mise en œuvre

15 Janvier 2025

## Pages concernées

- `/consumption` - Page de visualisation de la consommation électrique
- `/simulator` - Page de simulation et comparaison des offres d'électricité

---

## 1. Affichage immédiat des sections (Always Visible)

### Problème identifié
Les sections principales (Statistiques, Graphiques, Courbe détaillée, Puissance) n'apparaissaient qu'après le chargement des données, créant une expérience utilisateur désordonnée où le contenu "apparaissait" progressivement.

### Solution implémentée

#### Page Consumption
Toutes les sections sont maintenant visibles dès l'arrivée sur la page :

1. **Statistiques de consommation**
2. **Graphiques de consommation**
3. **Courbe de charge détaillée**
4. **Pics de puissance maximale**

#### Page Simulator
La section "Comparaison des offres" est maintenant toujours visible.

### Bénéfices UX
- **Prédictibilité** : L'utilisateur voit immédiatement la structure complète de la page
- **Pas de "content shifting"** : Le layout est stable dès le chargement
- **Meilleure compréhension** : L'utilisateur sait quelles données seront disponibles

---

## 2. États visuels conditionnels

### Implémentation

#### État "Sans données" (Disabled)
Quand les données ne sont pas encore chargées :
- **Opacité réduite** : `opacity-60` pour indiquer l'état désactivé
- **Curseur non-allowed** : `cursor-not-allowed` pour signaler qu'on ne peut pas cliquer
- **Sections pliées** : Toutes les sections restent fermées par défaut

#### État "Avec données" (Enabled)
Une fois les données chargées (`allLoadingComplete = true`) :
- **Opacité normale** : Les sections deviennent pleinement visibles
- **Curseur pointer** : `cursor-pointer` pour indiquer l'interactivité
- **Cliquable** : Les sections peuvent être dépliées pour voir le contenu

### Code pattern utilisé

```typescript
<div className={`p-6 ${
  allLoadingComplete ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
}`}>
  {/* Header de la section */}
</div>

{/* Contenu affiché seulement si données chargées ET section dépliée */}
{isExpanded && allLoadingComplete && (
  <div className="px-6 pb-6">
    {/* Composants de visualisation */}
  </div>
)}
```

---

## 3. Gestion du cache - Bouton administrateur

### Emplacement
Le bouton "Vider le cache" a été déplacé dans le menu latéral (sidebar) de l'application.

### Visibilité
- **Administrateurs uniquement** : Visible seulement pour les utilisateurs avec `is_admin = true`
- **Desktop** : Affiché dans la sidebar gauche sous le menu Administration
- **Mobile** : Affiché dans le menu hamburger

### Fonctionnalité
Le bouton vide tous les niveaux de cache :

1. **React Query cache** : `queryClient.removeQueries()`
2. **localStorage** : Suppression des clés liées à la consommation
3. **IndexedDB** : Suppression des bases de données React Query
4. **Redis (backend)** : Appel à `adminApi.clearAllConsumptionCache()`

### Auto-reload
- ✅ **Pas de rechargement forcé** : L'application s'appuie sur le hot-reload de Vite
- ✅ **Toast de confirmation** : "Cache vidé avec succès (Navigateur + Redis)"

### Code implémenté

```typescript
// apps/web/src/components/Layout.tsx
const handleClearCache = async () => {
  if (!user?.is_admin) {
    toast.error('Accès non autorisé')
    return
  }

  const confirmClear = window.confirm(
    'Êtes-vous sûr de vouloir vider tout le cache (Navigateur + Redis) ?\n\n' +
    'Cette action supprimera toutes les données en cache pour TOUS les utilisateurs et ne peut pas être annulée.'
  )

  if (!confirmClear) return

  setIsClearingCache(true)

  try {
    // 1. Clear React Query cache
    queryClient.removeQueries({ queryKey: ['consumptionDetail'] })
    queryClient.removeQueries({ queryKey: ['consumption'] })
    queryClient.removeQueries({ queryKey: ['maxPower'] })

    // 2. Clear localStorage
    // 3. Clear IndexedDB
    // 4. Clear Redis cache via API
    const response = await adminApi.clearAllConsumptionCache()

    toast.success('Cache vidé avec succès (Navigateur + Redis)')
  } catch (error) {
    toast.error('Erreur lors du vidage du cache')
  } finally {
    setIsClearingCache(false)
  }
}
```

---

## 4. Suppression du bloc "Empty State"

### Problème
Le message "Aucune donnée à afficher - Sélectionnez un PDL et cliquez sur 'Récupérer 3 ans d'historique depuis Enedis'" créait une confusion car :
- Il apparaissait en plus des sections déjà affichées
- Il redondait avec l'état visuel des sections désactivées

### Solution
Le bloc a été complètement supprimé du fichier `apps/web/src/pages/Consumption/index.tsx` (lignes 803-814).

### Remplacement
L'état "sans données" est maintenant communiqué par :
- Les sections grisées et non-cliquables
- Le bloc "Configuration" qui guide l'utilisateur vers l'action "Récupérer l'historique"
- Le composant "Progression du chargement" qui s'affiche dès qu'il y a du cache

---

## 5. Indicateurs de progression

### Composant LoadingProgress (Consumption)
Affiche la progression du chargement avec 4 tâches :

1. **Quotidien** : Données de consommation journalière (3 ans)
2. **Puissance** : Données de puissance maximale (3 ans)
3. **Détaillé** : Données détaillées avec intervalles de 30min (2 ans)
4. **HC/HP** : Calcul des heures creuses / pleines

### Composant SimulatorLoadingProgress
Affiche la progression avec 2 tâches :

1. **Données** : Récupération des 365 jours de consommation
2. **Calcul** : Simulation sur toutes les offres disponibles

### Visibilité du composant
Le composant de progression s'affiche maintenant **immédiatement** si :
- Une simulation/récupération est en cours **OU**
- Des données sont en cache (`hasCacheData` / `hasYesterdayDataInCache`)

Cela permet à l'utilisateur de voir instantanément s'il y a des données en cache.

---

## 6. Harmonisation visuelle

### Configuration blocks
Les blocs "Configuration" sont harmonisés entre `/consumption` et `/simulator` :
- Même classe CSS : `card`
- Même padding et espacement
- Même hiérarchie visuelle

### Boutons d'action
Les boutons principaux ont été harmonisés :
- **Même taille** : `py-3 px-6`
- **Mêmes couleurs** : `bg-primary-600 hover:bg-primary-700`
- **Même layout** : `flex items-center justify-center gap-2`
- **Mêmes ombres** : `shadow-md hover:shadow-lg`

---

## 7. Détection du cache

### Algorithme de détection

#### Page Consumption
```typescript
const hasYesterdayDataInCache = useMemo(() => {
  if (!selectedPDL) return false

  // Calcul de la date d'hier
  const yesterdayStr = /* date UTC hier */

  // Vérification du cache détaillé (jour par jour)
  const cacheKey = ['consumptionDetail', selectedPDL, yesterdayStr, yesterdayStr]
  const detailedQuery = queryClient.getQueryData(cacheKey)

  return detailedQuery?.data?.meter_reading?.interval_reading?.length > 0
}, [selectedPDL, queryClient])
```

#### Page Simulator
```typescript
const hasCacheData = useMemo(() => {
  if (!selectedPdl) return false

  // Échantillonnage de 7 dates
  let cachedCount = 0
  for (let i = 0; i < 7; i++) {
    const sampleDate = /* date échantillon */
    const cacheKey = ['consumptionDetail', selectedPdl, dateStr, dateStr]
    const cachedData = queryClient.getQueryData(cacheKey)
    if (cachedData) cachedCount++
  }

  // Si au moins 3 dates sur 7 sont en cache
  return cachedCount >= 3
}, [selectedPdl, queryClient])
```

---

## Impact utilisateur

### Avant les modifications
1. ❌ Page vide au chargement
2. ❌ Apparition progressive des sections (content shifting)
3. ❌ Message "Empty State" confus
4. ❌ Pas d'indication visuelle sur les sections disponibles
5. ❌ Bouton "Vider le cache" dans la page Configuration

### Après les modifications
1. ✅ Toutes les sections visibles immédiatement
2. ✅ Layout stable dès le chargement
3. ✅ États visuels clairs (grisé = pas de données, normal = données)
4. ✅ Progression du chargement visible dès qu'il y a du cache
5. ✅ Bouton "Vider le cache" centralisé dans le menu admin

---

## Fichiers modifiés

### Pages principales
- `apps/web/src/pages/Consumption/index.tsx` - Structure et logique d'affichage
- `apps/web/src/pages/Simulator.tsx` - Structure et affichage du simulateur

### Composants
- `apps/web/src/components/Layout.tsx` - Bouton de cache dans la sidebar
- `apps/web/src/pages/Consumption/components/LoadingProgress.tsx` - Détection de cache
- `apps/web/src/pages/Consumption/components/PDLSelector.tsx` - Configuration harmonisée
- `apps/web/src/pages/Simulator/SimulatorLoadingProgress.tsx` - Détection de cache

### API
- `apps/web/src/api/admin.ts` - Méthode `clearAllConsumptionCache()`

---

## Tests recommandés

### Tests manuels
1. ✅ Arriver sur `/consumption` sans données → toutes les sections sont visibles mais grisées
2. ✅ Cliquer sur "Récupérer l'historique" → les sections se déverrouillent progressivement
3. ✅ Recharger la page avec cache → "Progression du chargement" s'affiche immédiatement
4. ✅ Cliquer sur "Vider le cache" (admin) → confirmation + vidage multi-niveaux
5. ✅ Vérifier l'harmonisation visuelle entre `/consumption` et `/simulator`

### Tests automatisés (à implémenter)
```typescript
describe('Consumption Page - Always Visible Sections', () => {
  it('should display all sections on page load', () => {
    render(<Consumption />)
    expect(screen.getByText('Statistiques de consommation')).toBeInTheDocument()
    expect(screen.getByText('Graphiques de consommation')).toBeInTheDocument()
    expect(screen.getByText('Courbe de charge détaillée')).toBeInTheDocument()
    expect(screen.getByText('Pics de puissance maximale')).toBeInTheDocument()
  })

  it('should have disabled state when no data', () => {
    render(<Consumption />)
    const statsSection = screen.getByText('Statistiques de consommation').closest('div')
    expect(statsSection).toHaveClass('opacity-60')
    expect(statsSection).toHaveClass('cursor-not-allowed')
  })
})
```

---

## Migration et rollback

### Migration
Aucune migration de données nécessaire. Les modifications sont purement côté frontend.

### Rollback
En cas de problème, revenir au commit précédent :
```bash
git revert <commit-hash>
```

Les fichiers à surveiller pour détecter des régressions :
- Layout des pages (content shifting)
- Performance de détection du cache
- Fonctionnement du bouton "Vider le cache"

---

## Métriques de succès

### Indicateurs à surveiller
1. **Taux de rebond** sur `/consumption` et `/simulator`
2. **Temps passé sur la page** avant la première interaction
3. **Taux de clics** sur les sections pliées
4. **Utilisation du bouton "Vider le cache"** (fréquence admin)

### Objectifs
- Réduction du taux de rebond de 15%
- Augmentation du temps passé de 20%
- Meilleure compréhension de la structure de la page

---

## Prochaines étapes

### Améliorations futures possibles
1. **Animations de transition** lors du passage de l'état "disabled" à "enabled"
2. **Skeleton loaders** dans les sections pour indiquer le type de contenu à venir
3. **Tooltips explicatifs** sur les icônes de section
4. **Sauvegarde de l'état plié/déplié** des sections dans localStorage
5. **Indicateur de cache** plus visuel (badge avec timestamp de dernière mise à jour)

---

## Références

- Spec frontend : `docs/features-spec/01-front.md`
- Gestion du cache : `docs/features-spec/10-cache.md`
- Design system : Tailwind CSS utilities
- Framework : React + TypeScript + Vite
