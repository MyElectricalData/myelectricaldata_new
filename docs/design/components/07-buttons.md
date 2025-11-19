# Boutons

## Vue d'ensemble

Les boutons dans l'application utilisent deux approches :
1. **Classes CSS** : Classes réutilisables `.btn`, `.btn-primary`, `.btn-secondary` dans `index.css`
2. **ModernButton Component** : Composant React avec glassmorphism et gradients pour les interfaces modernes (ex: page Consommation)

Les boutons doivent être cohérents visuellement et indiquer clairement leur action.

## Règles

1. Utiliser les classes prédéfinies : `.btn`, `.btn-primary`, `.btn-secondary`
2. Toujours inclure dark mode
3. Icônes de taille 16 ou 18px dans les boutons
4. Gap de 2 (8px) entre icône et texte
5. Padding : `py-2 px-4` ou `py-3 px-6` selon l'importance

## Classes de Base

### Classes Définies dans index.css

```css
.btn {
  /* Base commune à tous les boutons */
  padding: 0.5rem 1rem;
  border-radius: 0.75rem;
  font-weight: 500;
  transition: all 0.2s;
  /* ... */
}

.btn-primary {
  /* Bouton d'action principale */
  background-color: #0284c7;
  color: white;
  /* ... */
}

.btn-secondary {
  /* Bouton d'action secondaire */
  background-color: transparent;
  border: 1px solid;
  /* ... */
}
```

## Code de référence

### Bouton Primaire

```tsx
<button className="btn btn-primary">
  Action Principale
</button>
```

### Bouton Primaire avec Icône

```tsx
<button className="btn btn-primary flex items-center justify-center gap-2">
  <Download size={18} />
  Télécharger
</button>
```

### Bouton Secondaire

```tsx
<button className="btn btn-secondary">
  Annuler
</button>
```

### Bouton Désactivé

```tsx
<button className="btn btn-primary" disabled>
  <Loader2 className="animate-spin" size={18} />
  Chargement...
</button>
```

### Bouton Full Width

```tsx
<button className="btn btn-primary w-full flex items-center justify-center gap-2">
  <RefreshCw size={18} />
  Récupérer l'historique
</button>
```

## Exemples d'utilisation

### Actions Principales (Formulaires)

```tsx
<div className="flex gap-2 justify-end">
  <button className="btn btn-secondary">
    Annuler
  </button>
  <button className="btn btn-primary">
    Enregistrer
  </button>
</div>
```

### Bouton d'Action avec Confirmation

```tsx
<button
  className="btn btn-primary flex items-center gap-2"
  onClick={handleFetchData}
  disabled={isLoading}
>
  {isLoading ? (
    <>
      <Loader2 className="animate-spin" size={18} />
      Récupération en cours...
    </>
  ) : (
    <>
      <Download size={18} />
      Récupérer les données
    </>
  )}
</button>
```

### Bouton Dangereux (Suppression)

```tsx
<button className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center gap-2">
  <Trash2 size={16} />
  Supprimer
</button>
```

### Bouton Icône Seule

```tsx
<button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
  <Settings size={20} className="text-gray-600 dark:text-gray-400" />
</button>
```

### Groupe de Boutons

```tsx
<div className="flex gap-2">
  <button className="btn btn-secondary">
    <ChevronLeft size={16} />
    Précédent
  </button>
  <button className="btn btn-primary">
    Suivant
    <ChevronRight size={16} />
  </button>
</div>
```

## États du Bouton

### Normal

```tsx
<button className="btn btn-primary">
  Cliquer
</button>
```

### Hover

```css
hover:bg-primary-700 dark:hover:bg-primary-600
hover:shadow-lg
```

### Focus

```css
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
```

### Disabled

```tsx
<button className="btn btn-primary opacity-60 cursor-not-allowed" disabled>
  Désactivé
</button>
```

### Loading

```tsx
<button className="btn btn-primary" disabled>
  <Loader2 className="animate-spin" size={18} />
  Chargement...
</button>
```

## Tailles de Bouton

### Small

```tsx
<button className="py-1 px-3 text-sm rounded-lg bg-primary-600 text-white">
  Petit
</button>
```

### Medium (par défaut)

```tsx
<button className="btn btn-primary">
  Moyen
</button>
```

### Large

```tsx
<button className="py-3 px-6 text-lg rounded-lg bg-primary-600 text-white shadow-md hover:shadow-lg">
  Grand
</button>
```

## À ne pas faire

### Pas de dark mode

```tsx
// ❌ INCORRECT
<button className="bg-primary-600 text-white">

// ✅ CORRECT
<button className="btn btn-primary">
```

### Icône sans gap

```tsx
// ❌ INCORRECT
<button className="btn btn-primary flex items-center">
  <Download size={18} />
  Télécharger
</button>

// ✅ CORRECT
<button className="btn btn-primary flex items-center gap-2">
  <Download size={18} />
  Télécharger
</button>
```

### Taille d'icône incorrecte

```tsx
// ❌ INCORRECT - Icône trop grande
<button className="btn btn-primary">
  <Download size={32} />
  Télécharger
</button>

// ✅ CORRECT
<button className="btn btn-primary flex items-center gap-2">
  <Download size={18} />
  Télécharger
</button>
```

### Pas de transition

```tsx
// ❌ INCORRECT
<button className="bg-primary-600 hover:bg-primary-700">

// ✅ CORRECT
<button className="bg-primary-600 hover:bg-primary-700 transition-colors">
```

### Loading sans disabled

```tsx
// ❌ INCORRECT - Clickable pendant le chargement
<button className="btn btn-primary">
  <Loader2 className="animate-spin" size={18} />
  Chargement...
</button>

// ✅ CORRECT
<button className="btn btn-primary" disabled>
  <Loader2 className="animate-spin" size={18} />
  Chargement...
</button>
```

## Accessibilité

### Attributs Requis

```tsx
<button
  type="button"
  aria-label="Description du bouton"
  disabled={isLoading}
>
  Cliquer
</button>
```

### Bouton Icône Seule

```tsx
<button
  className="p-2 rounded-lg hover:bg-gray-100"
  aria-label="Paramètres"
  title="Paramètres"
>
  <Settings size={20} />
</button>
```

---

## ModernButton Component

### Vue d'ensemble

Le composant `ModernButton` est un bouton React avec design glassmorphism et gradients, utilisé principalement dans les pages modernes comme Consommation. Il remplace les boutons CSS classiques pour des interfaces plus visuelles.

**Localisation** :
- `apps/web/src/pages/Consumption/components/ModernButton.tsx`
- `apps/web/src/pages/Simulator/components/ModernButton.tsx`
- `apps/web/src/pages/Production/components/ModernButton.tsx`

### Variantes

Le composant supporte 5 variantes via la prop `variant` :

1. **primary** - Gradient bleu, action principale
2. **secondary** - Fond transparent avec bordure, action secondaire
3. **gradient** - Gradient multicolore (bleu → indigo → violet)
4. **glass** - Glassmorphism transparent avec backdrop-blur
5. **tab** - Bouton onglet avec état actif/inactif

### Tailles

Trois tailles disponibles via la prop `size` :

- **sm** : `px-3 py-2 text-sm` (boutons compacts)
- **md** : `px-3.5 py-2 text-base` (par défaut)
- **lg** : `px-6 py-3 text-lg` (boutons d'action importants)

### Props

```typescript
interface ModernButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'gradient' | 'glass' | 'tab'
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
  iconPosition?: 'left' | 'right'
  isActive?: boolean      // Pour variant="tab"
  loading?: boolean       // Affiche spinner
  fullWidth?: boolean     // w-full
}
```

### Code de référence

#### Bouton Primary (Action Principale)

```tsx
import { ModernButton } from './components/ModernButton'
import { Download } from 'lucide-react'

<ModernButton
  variant="primary"
  size="lg"
  icon={Download}
  iconPosition="left"
  onClick={handleFetch}
  disabled={isLoading}
  loading={isLoading}
>
  Récupérer l'historique
</ModernButton>
```

#### Bouton Gradient (Export)

```tsx
import { Download } from 'lucide-react'

<ModernButton
  variant="gradient"
  size="sm"
  icon={Download}
  iconPosition="left"
  onClick={handleExport}
>
  Export JSON
</ModernButton>
```

#### Bouton Tab (Onglets d'années)

```tsx
<div className="flex gap-2 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
  {years.map((year, index) => (
    <ModernButton
      key={year}
      variant="tab"
      size="md"
      isActive={selectedYear === index}
      onClick={() => setSelectedYear(index)}
      className="flex-1 min-w-[80px]"
    >
      {year}
    </ModernButton>
  ))}
</div>
```

#### Bouton Secondary

```tsx
<ModernButton
  variant="secondary"
  size="md"
  onClick={handleCancel}
>
  Annuler
</ModernButton>
```

#### Bouton avec Loading

```tsx
<ModernButton
  variant="primary"
  size="md"
  loading={isSubmitting}
  disabled={isSubmitting}
>
  {isSubmitting ? 'En cours...' : 'Valider'}
</ModernButton>
```

#### Bouton Full Width

```tsx
<ModernButton
  variant="primary"
  size="lg"
  fullWidth
  icon={Download}
>
  Télécharger
</ModernButton>
```

### Détails des Variantes

#### Primary

- **Design** : Gradient bleu (from-primary-500 → via-primary-600 → to-primary-700)
- **Hover** : Gradient plus foncé + shadow-xl + scale-[1.01]
- **Effets** : Shine effect (barre lumineuse qui traverse au hover)
- **Usage** : Actions principales, validation, confirmation

```tsx
<ModernButton variant="primary">Action Principale</ModernButton>
```

#### Secondary

- **Design** : Fond blanc/transparent avec bordure gray-200
- **Hover** : Bordure primary-400 + shadow-lg + scale-[1.01]
- **Glassmorphism** : backdrop-blur-sm
- **Usage** : Actions secondaires, annulation

```tsx
<ModernButton variant="secondary">Annuler</ModernButton>
```

#### Gradient

- **Design** : Gradient multicolore (blue-500 → indigo-600 → purple-600)
- **Hover** : Gradient plus foncé + shadow-lg + scale-[1.01]
- **Effets** : Shine effect avec opacity 30%
- **Usage** : Export, téléchargement, actions spéciales

```tsx
<ModernButton variant="gradient" icon={Download}>Export</ModernButton>
```

#### Glass

- **Design** : Fond transparent (white/10 dark:gray-900/10) avec backdrop-blur-md
- **Hover** : Fond plus opaque + bordure plus visible + shadow-xl + scale-[1.01]
- **Usage** : Boutons sur fonds complexes, overlays

```tsx
<ModernButton variant="glass">Voir détails</ModernButton>
```

#### Tab

- **Design Actif** : Gradient primary-500 → primary-600 + border-primary-600
- **Design Inactif** : Fond white/80 avec bordure gray-200
- **Hover** : brightness-110 (actif) ou border-primary-400 (inactif)
- **Critères** : border-2 permanent pour éviter layout shift
- **Usage** : Sélection d'années, filtres, onglets

```tsx
<ModernButton variant="tab" isActive={selectedYear === 2025}>
  2025
</ModernButton>
```

### Bonnes Pratiques

#### 1. Conteneur avec scrollbar caché

Pour les rangées de tabs horizontales, toujours utiliser :

```tsx
<div className="flex gap-2 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
  {/* Tabs ici */}
</div>
```

**Raisons** :
- `overflow-x-auto` : Scroll horizontal si nécessaire
- `overflow-y-hidden` : Évite scrollbar vertical
- `py-3 px-2` : Padding généreux pour éviter layout shift
- `no-scrollbar` : Classe CSS custom pour cacher scrollbar

#### 2. Classe .no-scrollbar

Ajoutée dans `apps/web/src/index.css` :

```css
/* Hide scrollbar completely for specific elements */
.no-scrollbar {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.no-scrollbar::-webkit-scrollbar {
  display: none;  /* Chrome, Safari, Opera */
}
```

#### 3. Éviter les layout shifts

**Problème résolu** : Les boutons tab causaient des "sauts" lors du clic

**Solution** :
- Border-width constant : `border-2` sur tous les états (actif/inactif)
- Bouton actif : `border-primary-600` (se fond avec le gradient)
- Bouton inactif : `border-gray-200` (visible)
- Transitions spécifiques au lieu de `transition-all`

```tsx
// ❌ INCORRECT - Cause layout shift
isActive
  ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'  // Pas de border
  : 'border-2 border-gray-200'  // Border de 2px

// ✅ CORRECT - Pas de layout shift
`border-2 ${isActive
  ? 'border-primary-600 bg-gradient-to-r from-primary-500 to-primary-600'
  : 'border-gray-200'
}`
```

#### 4. Optimisation des animations

**Transitions spécifiques** au lieu de `transition-all` :

```tsx
// ❌ INCORRECT - Anime tout, même les propriétés non voulues
transition-all duration-300

// ✅ CORRECT - Anime uniquement ce qui est nécessaire
transition-[background-color,border-color,box-shadow,filter] duration-200
```

**GPU Acceleration** :

```tsx
will-change-[filter]  // Prépare GPU pour animations de filtre
```

**Propriétés optimisées** :
- `brightness` au lieu de `scale` (pas de layout shift, GPU-accelerated)
- `filter` pour effets visuels
- `box-shadow` pour profondeur

#### 5. Taille des icônes

```tsx
const iconSize = size === 'sm' ? 16 : size === 'md' ? 20 : 24
```

- **sm** : 16px
- **md** : 20px (par défaut)
- **lg** : 24px

#### 6. États de chargement

Le spinner remplace l'icône pendant le chargement :

```tsx
{loading && iconPosition === 'left' && (
  <svg className="animate-spin" width={iconSize} height={iconSize}>
    {/* SVG spinner */}
  </svg>
)}

{!loading && Icon && iconPosition === 'left' && (
  <Icon size={iconSize} />
)}
```

### À ne pas faire

#### ❌ Utiliser scale sans précautions

```tsx
// INCORRECT - Cause scrollbar
hover:scale-[1.02]

// CORRECT - Utiliser brightness
hover:brightness-110
```

#### ❌ Border-width variable sur les tabs

```tsx
// INCORRECT - Cause layout shift
isActive ? '' : 'border-2'

// CORRECT - Border constant
border-2 ${isActive ? 'border-primary-600' : 'border-gray-200'}
```

#### ❌ Transition-all

```tsx
// INCORRECT - Performances
transition-all

// CORRECT - Transitions spécifiques
transition-[background-color,border-color,box-shadow,filter]
```

#### ❌ Oublier overflow-y-hidden

```tsx
// INCORRECT - Scrollbar vertical possible
<div className="flex gap-2 overflow-x-auto">

// CORRECT - Pas de scrollbar vertical
<div className="flex gap-2 overflow-x-auto overflow-y-hidden">
```

#### ❌ Shadow trop prononcée

```tsx
// INCORRECT - Trop visible
shadow-lg shadow-primary-500/40

// CORRECT - Subtile
shadow-sm shadow-primary-500/10 dark:shadow-primary-500/8
```

### Exemples d'utilisation

#### Page Production

La page Production utilise ModernButton pour :

**Bouton principal de récupération** :
```tsx
<ModernButton
  variant="primary"
  size="lg"
  fullWidth
  onClick={onFetchData}
  disabled={!selectedPDL || isLoading || isLoadingDetailed || isDemo}
  loading={isLoading || isLoadingDetailed}
  icon={isDemo ? Lock : Download}
  iconPosition="left"
>
  {isLoading || isLoadingDetailed
    ? 'Récupération en cours...'
    : isDemo
    ? 'Récupération bloquée en mode démo'
    : 'Récupérer l\'historique de production'
  }
</ModernButton>
```

**Boutons d'accès rapide** :
```tsx
<ModernButton
  variant="secondary"
  size="sm"
  onClick={() => {
    onWeekOffsetChange(0)
    setSelectedDetailDay(0)
    toast.success("Retour à la veille")
  }}
>
  Hier
</ModernButton>
```

**Onglets d'années avec zoom** :
```tsx
<div className="flex gap-2 flex-1 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
  {[...yearsData].reverse().map((yearData, idx) => (
    <ModernButton
      key={yearData.label}
      variant="tab"
      size="md"
      isActive={selectedYears.has(originalIndex)}
      onClick={() => toggleYearSelection(originalIndex)}
      className="flex-1 min-w-[100px]"
    >
      {yearData.label}
    </ModernButton>
  ))}
</div>

{/* Boutons d'action */}
<ModernButton
  variant="gradient"
  size="sm"
  icon={ZoomOut}
  iconPosition="left"
  onClick={zoomOut}
  className="bg-gradient-to-r from-purple-500 to-pink-600"
>
  Réinitialiser
</ModernButton>

<ModernButton
  variant="gradient"
  size="sm"
  icon={Download}
  iconPosition="left"
  onClick={handleExport}
>
  Export JSON
</ModernButton>
```

#### Page Simulateur

La page Simulateur utilise ModernButton pour :

**Bouton principal de lancement** :
```tsx
<ModernButton
  variant="primary"
  size="lg"
  fullWidth
  onClick={handleSimulation}
  disabled={isSimulating || !selectedPdl}
  loading={isSimulating}
  icon={isSimulating ? undefined : Calculator}
  iconPosition="left"
>
  {isSimulating
    ? 'Simulation en cours...'
    : 'Lancer la simulation'
  }
</ModernButton>
```

**Bouton export PDF** :
```tsx
<ModernButton
  variant="gradient"
  size="sm"
  icon={FileDown}
  iconPosition="left"
  onClick={exportToPDF}
>
  Exporter en PDF
</ModernButton>
```

#### Groupe de tabs d'années

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
  {/* Tabs à gauche */}
  <div className="flex gap-2 flex-1 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
    {years.map((year, idx) => (
      <ModernButton
        key={year}
        variant="tab"
        size="md"
        isActive={selectedYear === idx}
        onClick={() => setSelectedYear(idx)}
        className="flex-1 min-w-[80px]"
      >
        {year}
      </ModernButton>
    ))}
  </div>

  {/* Boutons d'action à droite */}
  <div className="flex gap-2">
    <ModernButton
      variant="gradient"
      size="sm"
      icon={Download}
      iconPosition="left"
      onClick={handleExport}
    >
      Export JSON
    </ModernButton>
  </div>
</div>
```

#### Boutons d'accès rapide

```tsx
<div className="flex gap-2 flex-wrap">
  <ModernButton
    variant="secondary"
    size="sm"
    onClick={() => handleQuickAccess('yesterday')}
  >
    Hier
  </ModernButton>
  <ModernButton
    variant="secondary"
    size="sm"
    onClick={() => handleQuickAccess('last-week')}
  >
    Semaine dernière
  </ModernButton>
  <ModernButton
    variant="secondary"
    size="sm"
    onClick={() => handleQuickAccess('year-ago')}
  >
    Il y a un an
  </ModernButton>
</div>
```

#### Bouton avec zoom reset

```tsx
{zoomDomain && (
  <ModernButton
    variant="gradient"
    size="sm"
    icon={ZoomOut}
    iconPosition="left"
    onClick={zoomOut}
    title="Réinitialiser le zoom"
    className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
  >
    Réinitialiser
  </ModernButton>
)}
```

### Migration depuis les boutons CSS

Si vous migrez des anciens boutons vers ModernButton :

```tsx
// AVANT (classe CSS)
<button className="btn btn-primary flex items-center gap-2">
  <Download size={18} />
  Télécharger
</button>

// APRÈS (ModernButton)
<ModernButton
  variant="primary"
  size="md"
  icon={Download}
  iconPosition="left"
>
  Télécharger
</ModernButton>
```

**Avantages** :
- Design plus moderne (glassmorphism, gradients)
- Animations optimisées (GPU-accelerated)
- Props TypeScript typées
- Gestion automatique du loading state
- Icônes intégrées avec sizing automatique
- Pas de layout shift

### Performance

Le composant ModernButton est optimisé pour :

1. **GPU Acceleration** : `will-change-[filter]` pour les animations de filtre
2. **Transitions ciblées** : Seulement les propriétés nécessaires
3. **Pas de layout shift** : Border constant, brightness au lieu de scale
4. **Durée optimale** : 200ms (compromise entre smoothness et réactivité)

### Accessibilité

```tsx
<ModernButton
  variant="primary"
  aria-label="Télécharger les données"
  title="Télécharger les données au format JSON"
  disabled={!hasData}
>
  Télécharger
</ModernButton>
```

Le composant hérite de `ButtonHTMLAttributes<HTMLButtonElement>`, donc tous les attributs HTML standard sont supportés.

---

## Voir aussi

- [10 - Icônes](./10-icons.md) - Pour les icônes dans les boutons
- [11 - États](./11-states.md) - Pour les états interactifs
- [13 - Loading](./13-loading.md) - Pour les états de chargement
- [04 - Couleurs](./04-colors.md) - Pour les couleurs de bouton
