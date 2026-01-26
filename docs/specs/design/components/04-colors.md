# Palette de Couleurs

## Vue d'ensemble

La palette de couleurs définit tous les codes couleur utilisés dans l'application. Chaque couleur DOIT avoir une variante dark mode.

## Règles

1. **TOUJOURS** fournir une variante dark pour chaque couleur
2. Maintenir le même ratio de contraste entre light et dark mode
3. Utiliser la classe `dark:` pour toutes les propriétés de couleur
4. Tester en mode sombre pour vérifier la lisibilité

## Couleur Primaire (Bleu Ciel)

### Codes Couleur

```css
Primary-600: #0284c7   /* Couleur principale (light mode) */
Primary-400: #0ea5e9   /* Couleur principale (dark mode) */
Primary-500: #0ea5e9   /* Variante light */
Primary-700: #0369a1   /* Variante dark */
```

### Utilisation

```tsx
// Icônes
className="text-primary-600 dark:text-primary-400"

// Boutons
className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"

// Liens
className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-500"
```

## Couleurs de Texte

### Light Mode

```css
Titre principal: text-gray-900
Texte secondaire: text-gray-600
Texte désactivé: text-gray-400
Texte sur fond coloré: text-white
```

### Dark Mode

```css
Titre principal: dark:text-white
Texte secondaire: dark:text-gray-400
Texte désactivé: dark:text-gray-500
Texte sur fond coloré: dark:text-white
```

### Exemples

```tsx
// Titre H1
<h1 className="text-gray-900 dark:text-white">

// Sous-titre
<p className="text-gray-600 dark:text-gray-400">

// Label
<label className="text-gray-700 dark:text-gray-300">

// Texte désactivé
<span className="text-gray-400 dark:text-gray-500">
```

## Couleurs de Fond

### Light Mode

```css
Fond de carte: bg-white
Fond de page: bg-gray-50 (géré par Layout)
Fond secondaire: bg-gray-100
Fond hover: bg-gray-200
```

### Dark Mode

```css
Fond de carte: dark:bg-gray-800
Fond de page: dark:bg-gray-900 (géré par Layout)
Fond secondaire: dark:bg-gray-700
Fond hover: dark:bg-gray-700
```

### Exemples

```tsx
// Card
<div className="bg-white dark:bg-gray-800">

// Fond de filtre
<div className="bg-gray-50 dark:bg-gray-900/30">

// Hover sur ligne de tableau
<tr className="hover:bg-gray-100 dark:hover:bg-gray-700">
```

## Couleurs de Bordure

### Standard

```css
/* Light Mode */
border-gray-300

/* Dark Mode */
dark:border-gray-700
```

### Exemples

```tsx
// Card
<div className="border border-gray-300 dark:border-gray-700">

// Input
<input className="border-gray-300 dark:border-gray-600">

// Divider
<hr className="border-gray-200 dark:border-gray-700">
```

## Couleurs de Statut

### Info (Bleu)

```css
/* Light Mode */
bg-blue-50
border-blue-200
text-blue-800

/* Dark Mode */
dark:bg-blue-900/20
dark:border-blue-800
dark:text-blue-200
```

### Success (Vert)

```css
/* Light Mode */
bg-green-50
border-green-200
text-green-800

/* Dark Mode */
dark:bg-green-900/20
dark:border-green-800
dark:text-green-200
```

### Warning (Jaune/Orange)

```css
/* Light Mode */
bg-yellow-50
border-yellow-200
text-yellow-800

/* Dark Mode */
dark:bg-yellow-900/20
dark:border-yellow-800
dark:text-yellow-200
```

### Error (Rouge)

```css
/* Light Mode */
bg-red-50
border-red-200
text-red-800

/* Dark Mode */
dark:bg-red-900/20
dark:border-red-800
dark:text-red-200
```

## Code de référence

### Bloc d'Information (Info)

```tsx
<div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
  <p className="text-sm text-blue-800 dark:text-blue-200">
    <strong>ℹ️ Note :</strong> Votre message d'information
  </p>
</div>
```

### Bloc de Succès

```tsx
<div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
  <p className="text-sm text-green-800 dark:text-green-200">
    <strong>✓ Succès :</strong> Opération réussie
  </p>
</div>
```

### Bloc d'Avertissement

```tsx
<div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
  <p className="text-sm text-yellow-800 dark:text-yellow-200">
    <strong>⚠️ Attention :</strong> Message d'avertissement
  </p>
</div>
```

### Bloc d'Erreur

```tsx
<div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
  <p className="text-sm text-red-800 dark:text-red-200">
    <strong>❌ Erreur :</strong> Message d'erreur
  </p>
</div>
```

## Badges de Statut

### Badge Ancien (Orange)

```tsx
<span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded font-semibold">
  ⚠️ Ancien
</span>
```

### Badge Actif (Vert)

```tsx
<span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-semibold">
  ✓ Actif
</span>
```

### Badge En attente (Jaune)

```tsx
<span className="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded font-semibold">
  ⏳ En attente
</span>
```

## À ne pas faire

### Couleur sans dark mode

```tsx
// ❌ INCORRECT
<div className="bg-white">
<p className="text-gray-600">
<div className="border-gray-300">

// ✅ CORRECT
<div className="bg-white dark:bg-gray-800">
<p className="text-gray-600 dark:text-gray-400">
<div className="border-gray-300 dark:border-gray-700">
```

### Couleurs hardcodées

```tsx
// ❌ INCORRECT
<div style={{color: '#0284c7'}}>
<div style={{backgroundColor: '#ffffff'}}>

// ✅ CORRECT
<div className="text-primary-600 dark:text-primary-400">
<div className="bg-white dark:bg-gray-800">
```

### Contraste insuffisant

```tsx
// ❌ INCORRECT - Texte gris clair sur fond blanc
<div className="bg-white">
  <p className="text-gray-300">Texte peu lisible</p>
</div>

// ✅ CORRECT - Texte gris foncé sur fond blanc
<div className="bg-white dark:bg-gray-800">
  <p className="text-gray-600 dark:text-gray-400">Texte lisible</p>
</div>
```

## Voir aussi

- [14 - Dark Mode](./14-dark-mode.md) - Pour la gestion du dark mode
- [11 - États](./11-states.md) - Pour les états de hover et focus
- [02 - Header](./02-header.md) - Pour les couleurs de titre
- [10 - Icônes](./10-icons.md) - Pour les couleurs d'icônes
