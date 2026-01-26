# États Interactifs

## Vue d'ensemble

Les états interactifs (hover, focus, disabled, active) donnent du feedback visuel à l'utilisateur et améliorent l'accessibilité.

## Règles

1. Toujours inclure hover pour les éléments cliquables
2. Focus obligatoire pour l'accessibilité (navigation clavier)
3. Transitions pour rendre les changements fluides
4. États disabled clairs (opacity-60 + cursor-not-allowed)
5. TOUJOURS inclure variante dark mode

## États Standard

### Hover

```css
/* Boutons */
hover:bg-primary-700 dark:hover:bg-primary-600
hover:shadow-lg

/* Liens */
hover:text-primary-600 dark:hover:text-primary-400
hover:underline

/* Cards */
hover:shadow-lg

/* Lignes de tableau */
hover:bg-gray-100 dark:hover:bg-gray-700
```

### Focus

```css
/* Focus standard */
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2

/* Focus visible (accessibilité) */
focus-visible:ring-2 focus-visible:ring-primary-500
```

### Disabled/Loading

```css
/* Désactivé */
opacity-60 cursor-not-allowed

/* Loading */
opacity-75 cursor-wait
```

### Active

```css
/* Bouton pressé */
active:scale-95

/* État sélectionné */
bg-primary-50 dark:bg-primary-900/20
```

## Code de référence

### Bouton avec États

```tsx
<button
  className="
    btn btn-primary
    hover:bg-primary-700 dark:hover:bg-primary-600
    hover:shadow-lg
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
    active:scale-95
    disabled:opacity-60 disabled:cursor-not-allowed
    transition-all duration-200
  "
  disabled={isLoading}
>
  {isLoading ? 'Chargement...' : 'Valider'}
</button>
```

### Lien avec États

```tsx
<Link
  to="/page"
  className="
    text-primary-600 dark:text-primary-400
    hover:text-primary-700 dark:hover:text-primary-500
    hover:underline
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
    transition-colors duration-200
  "
>
  Voir plus
</Link>
```

### Card Cliquable

```tsx
<div
  className="
    card
    cursor-pointer
    hover:shadow-lg
    hover:border-primary-300 dark:hover:border-primary-600
    focus:outline-none focus:ring-2 focus:ring-primary-500
    active:scale-[0.98]
    transition-all duration-200
  "
  role="button"
  tabIndex={0}
  onClick={handleClick}
>
  {/* Contenu */}
</div>
```

### Input avec États

```tsx
<input
  className="
    input
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
    disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-900
    transition-all duration-200
  "
  disabled={isDisabled}
/>
```

### Header de Section Collapsible

```tsx
<div
  className={`
    p-6 cursor-pointer
    hover:bg-gray-50 dark:hover:bg-gray-700/50
    transition-colors duration-200
    ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}
  `}
  onClick={() => {
    if (!isLoading) {
      setIsExpanded(!isExpanded)
    }
  }}
>
  {/* Contenu */}
</div>
```

## Exemples d'utilisation

### Tableau avec Hover

```tsx
<table>
  <tbody>
    {items.map((item) => (
      <tr
        key={item.id}
        className="
          hover:bg-gray-100 dark:hover:bg-gray-700
          transition-colors duration-150
        "
      >
        <td>{item.name}</td>
        <td>{item.value}</td>
      </tr>
    ))}
  </tbody>
</table>
```

### Bouton Loading

```tsx
<button
  className="btn btn-primary"
  disabled={isLoading}
  onClick={handleSubmit}
>
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

### Liste Sélectionnable

```tsx
{items.map((item) => (
  <div
    key={item.id}
    className={`
      p-4 rounded-lg cursor-pointer
      ${
        selectedId === item.id
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500'
          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700'
      }
      hover:shadow-md
      focus:outline-none focus:ring-2 focus:ring-primary-500
      transition-all duration-200
    `}
    role="button"
    tabIndex={0}
    onClick={() => setSelectedId(item.id)}
    onKeyPress={(e) => e.key === 'Enter' && setSelectedId(item.id)}
  >
    {item.name}
  </div>
))}
```

### Icône Cliquable

```tsx
<button
  className="
    p-2 rounded-lg
    hover:bg-gray-100 dark:hover:bg-gray-700
    focus:outline-none focus:ring-2 focus:ring-primary-500
    transition-colors duration-200
  "
  aria-label="Paramètres"
>
  <Settings
    className="text-gray-600 dark:text-gray-400"
    size={20}
  />
</button>
```

### Toggle Switch

```tsx
<button
  className={`
    relative w-12 h-6 rounded-full
    ${enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}
    hover:shadow-md
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
    transition-colors duration-200
  `}
  onClick={() => setEnabled(!enabled)}
>
  <span
    className={`
      absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
      ${enabled ? 'translate-x-6' : 'translate-x-0'}
      transition-transform duration-200
    `}
  />
</button>
```

## Transitions

### Durées Standard

```css
/* Rapide (couleurs, opacité) */
duration-150

/* Standard (la plupart des interactions) */
duration-200

/* Lent (animations complexes) */
duration-300
```

### Types de Transition

```css
/* Tout */
transition-all duration-200

/* Couleurs uniquement */
transition-colors duration-200

/* Transform uniquement */
transition-transform duration-200

/* Shadow uniquement */
transition-shadow duration-200
```

## À ne pas faire

### Hover sans transition

```tsx
// ❌ INCORRECT - Changement brutal
<button className="bg-primary-600 hover:bg-primary-700">

// ✅ CORRECT
<button className="bg-primary-600 hover:bg-primary-700 transition-colors duration-200">
```

### Focus sans ring

```tsx
// ❌ INCORRECT - Pas de feedback visuel pour navigation clavier
<button className="btn btn-primary">

// ✅ CORRECT
<button className="btn btn-primary focus:outline-none focus:ring-2 focus:ring-primary-500">
```

### Disabled sans visual feedback

```tsx
// ❌ INCORRECT
<button disabled>Désactivé</button>

// ✅ CORRECT
<button className="opacity-60 cursor-not-allowed" disabled>
  Désactivé
</button>
```

### Hover sans dark mode

```tsx
// ❌ INCORRECT
<button className="hover:bg-gray-100">

// ✅ CORRECT
<button className="hover:bg-gray-100 dark:hover:bg-gray-700">
```

### Cliquable sans cursor-pointer

```tsx
// ❌ INCORRECT
<div onClick={handleClick}>

// ✅ CORRECT
<div className="cursor-pointer" onClick={handleClick}>
```

## Accessibilité

### Navigation Clavier

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyPress={(e) => e.key === 'Enter' && handleClick()}
  className="focus:outline-none focus:ring-2 focus:ring-primary-500"
>
  {/* Contenu */}
</div>
```

### Focus Visible

```tsx
<button
  className="
    focus:outline-none
    focus-visible:ring-2 focus-visible:ring-primary-500
  "
>
  Cliquer
</button>
```

### États ARIA

```tsx
<button
  aria-disabled={isLoading}
  aria-pressed={isActive}
  aria-busy={isLoading}
  disabled={isLoading}
>
  {/* Contenu */}
</button>
```

## Améliorations UX 2025

### États Conditionnels : Disabled vs Enabled

Depuis janvier 2025, les sections et composants utilisent un système d'états visuels clairs pour indiquer la disponibilité des données.

#### Pattern : Déverrouillage Progressif

Les sections se "déverrouillent" progressivement au fur et à mesure que les données sont chargées.

##### Code de référence

```tsx
// État conditionnel basé sur la disponibilité des données
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
  {/* Contenu du header */}
</div>
```

#### États Visuels

##### Sans Données (Disabled)

```tsx
// Classes pour état disabled
className="opacity-60 cursor-not-allowed"
```

Caractéristiques :
- Opacité réduite à 60%
- Curseur `not-allowed` au survol
- Non cliquable (condition dans onClick)
- Section pliée par défaut

##### Avec Données (Enabled)

```tsx
// Classes pour état enabled
className="opacity-100 cursor-pointer"
```

Caractéristiques :
- Opacité normale (100%)
- Curseur `pointer` au survol
- Cliquable et interactive
- Peut être dépliée/repliée

#### Logique de Déverrouillage

```tsx
// Exemple : Logique de chargement
const [allLoadingComplete, setAllLoadingComplete] = useState(false)

// Mise à jour de l'état quand toutes les tâches sont complètes
useEffect(() => {
  const isComplete =
    !dailyLoading && dailyComplete &&
    !powerLoading && powerComplete &&
    !detailLoading && detailComplete &&
    !hcHpLoading && hcHpComplete

  setAllLoadingComplete(isComplete)
}, [
  dailyLoading, dailyComplete,
  powerLoading, powerComplete,
  detailLoading, detailComplete,
  hcHpLoading, hcHpComplete
])
```

#### Condition de Rendu du Contenu

Le contenu ne s'affiche que si DEUX conditions sont vraies :

```tsx
{isExpanded && allLoadingComplete && (
  <div className="px-6 pb-6 space-y-8">
    {/* Contenu de la section */}
  </div>
)}
```

1. Section dépliée : `isExpanded = true`
2. Données chargées : `allLoadingComplete = true`

#### Bénéfices UX

1. **Feedback visuel clair** : L'utilisateur sait immédiatement quelles sections sont disponibles
2. **Pas de frustration** : Impossible de cliquer sur des sections vides
3. **Guidance naturelle** : Les états grisés guident vers les sections prêtes
4. **Déverrouillage progressif** : Sensation de progression pendant le chargement
5. **Cohérence** : Pattern uniforme dans toute l'application

#### Pages Utilisant ce Pattern

- `/consumption` - 4 sections avec déverrouillage progressif
- `/simulator` - Section "Comparaison des offres"
- Toute page avec sections collapsibles dépendantes de données

#### Voir aussi

- [03 - Sections](./03-sections.md) - Pour les sections always visible
- [13 - Loading](./13-loading.md) - Pour la progression du chargement

## Voir aussi

- [07 - Boutons](./07-buttons.md) - Pour les états de boutons
- [08 - Cards](./08-cards.md) - Pour les états de cards
- [09 - Formulaires](./09-forms.md) - Pour les états de formulaire
- [13 - Loading](./13-loading.md) - Pour les états de chargement
