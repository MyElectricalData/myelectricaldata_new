# Boutons

## Vue d'ensemble

Les boutons sont définis par des classes CSS réutilisables dans `index.css`. Ils doivent être cohérents visuellement et indiquer clairement leur action.

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

## Voir aussi

- [10 - Icônes](./10-icons.md) - Pour les icônes dans les boutons
- [11 - États](./11-states.md) - Pour les états interactifs
- [13 - Loading](./13-loading.md) - Pour les états de chargement
- [04 - Couleurs](./04-colors.md) - Pour les couleurs de bouton
