# Typographie

## Vue d'ensemble

Les règles de typographie définissent les tailles et poids de police utilisés dans l'application pour créer une hiérarchie visuelle claire.

## Règles

1. Utiliser les tailles Tailwind standard (`text-3xl`, `text-lg`, etc.)
2. Ne pas créer de tailles personnalisées
3. Respecter la hiérarchie : H1 > H2 > Body > Small
4. Associer les bons poids aux bons contextes (bold pour H1, semibold pour H2)

## Tailles de Police

### Hiérarchie des Titres

```css
H1 (Page Title): text-3xl (30px / 1.875rem)
H2 (Section Title): text-lg (18px / 1.125rem)
H3 (Subsection): text-base (16px / 1rem) avec font-medium
Body: text-base (16px / 1rem)
Small: text-sm (14px / 0.875rem)
Extra Small: text-xs (12px / 0.75rem)
```

### Correspondance Pixels

| Classe Tailwind | Pixels | Rem | Utilisation |
|----------------|--------|-----|-------------|
| `text-3xl` | 30px | 1.875rem | H1 - Titre principal |
| `text-lg` | 18px | 1.125rem | H2 - Titre de section |
| `text-base` | 16px | 1rem | Body - Texte normal |
| `text-sm` | 14px | 0.875rem | Small - Texte secondaire |
| `text-xs` | 12px | 0.75rem | Extra Small - Labels, badges |

## Poids de Police

### Valeurs Standard

```css
Title (H1): font-bold (700)
Section Header (H2): font-semibold (600)
Medium emphasis: font-medium (500)
Body: font-normal (400) - default
```

### Utilisation par Contexte

| Élément | Taille | Poids | Classes |
|---------|--------|-------|---------|
| H1 | text-3xl | font-bold | `text-3xl font-bold` |
| H2 | text-lg | font-semibold | `text-lg font-semibold` |
| H3 | text-base | font-medium | `text-base font-medium` |
| Body | text-base | font-normal | `text-base` (default) |
| Label | text-sm | font-medium | `text-sm font-medium` |
| Caption | text-xs | font-normal | `text-xs` |

## Code de référence

### Titre Principal (H1)

```tsx
<h1 className="text-3xl font-bold mb-2 flex items-center gap-3 text-gray-900 dark:text-white">
  <IconComponent className="text-primary-600 dark:text-primary-400" size={32} />
  Titre de la Page
</h1>
```

### Titre de Section (H2)

```tsx
<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
  Titre de la Section
</h2>
```

### Titre de Sous-section (H3)

```tsx
<h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
  Sous-section
</h3>
```

### Sous-titre de Page

```tsx
<p className="text-gray-600 dark:text-gray-400">
  Description de la page ou sous-titre
</p>
```

### Label de Formulaire

```tsx
<label className="text-sm font-medium text-gray-700 dark:text-gray-300">
  Nom du champ
</label>
```

### Texte d'Information

```tsx
<p className="text-sm text-gray-600 dark:text-gray-400">
  Information complémentaire ou aide
</p>
```

### Caption / Légende

```tsx
<span className="text-xs text-gray-500 dark:text-gray-400">
  Dernière mise à jour : 15/01/2025
</span>
```

## Exemples d'utilisation

### Header de Page Complet

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3 text-gray-900 dark:text-white">
    <TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
    Consommation
  </h1>
  <p className="text-gray-600 dark:text-gray-400">
    Analysez votre consommation électrique en détail
  </p>
</div>
```

### Section avec Différentes Typographies

```tsx
<div className="card">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
    Configuration du PDL
  </h2>

  <div className="space-y-4">
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
        Point de Livraison (PDL)
      </label>
      <select className="input">
        <option>Sélectionnez un PDL</option>
      </select>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Choisissez le compteur à analyser
      </p>
    </div>
  </div>
</div>
```

### Tableau avec Typographies

```tsx
<table>
  <thead>
    <tr>
      <th className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Date
      </th>
      <th className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Consommation
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="text-sm text-gray-900 dark:text-white">
        15/01/2025
      </td>
      <td className="text-sm text-gray-600 dark:text-gray-400">
        12.5 kWh
      </td>
    </tr>
  </tbody>
</table>
```

## À ne pas faire

### Taille de H1 incorrecte

```tsx
// ❌ INCORRECT
<h1 className="text-2xl font-bold">
<h1 className="text-4xl font-bold">

// ✅ CORRECT
<h1 className="text-3xl font-bold">
```

### Poids de H2 incorrect

```tsx
// ❌ INCORRECT
<h2 className="text-lg font-bold">
<h2 className="text-lg font-medium">

// ✅ CORRECT
<h2 className="text-lg font-semibold">
```

### Tailles personnalisées

```tsx
// ❌ INCORRECT
<p style={{fontSize: '15px'}}>
<p className="text-[15px]">

// ✅ CORRECT
<p className="text-sm"> // 14px
<p className="text-base"> // 16px
```

### Pas de couleur dark mode

```tsx
// ❌ INCORRECT
<h1 className="text-3xl font-bold text-gray-900">

// ✅ CORRECT
<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
```

### Hiérarchie inversée

```tsx
// ❌ INCORRECT - H2 plus grand que H1
<h1 className="text-lg">Titre principal</h1>
<h2 className="text-3xl">Sous-titre</h2>

// ✅ CORRECT
<h1 className="text-3xl font-bold">Titre principal</h1>
<h2 className="text-lg font-semibold">Sous-titre</h2>
```

## Accessibilité

### Contraste Minimum

- Texte normal (< 18px) : ratio de contraste minimum 4.5:1
- Texte large (≥ 18px) : ratio de contraste minimum 3:1
- Texte en gras (≥ 14px bold) : ratio de contraste minimum 3:1

### Tailles Minimales

- Ne jamais utiliser de texte plus petit que `text-xs` (12px)
- Pour du texte très secondaire, préférer `text-sm` (14px)

### Sémantique HTML

Toujours utiliser les bonnes balises HTML :
- `<h1>` pour le titre principal (un seul par page)
- `<h2>` pour les sections principales
- `<h3>` pour les sous-sections
- `<p>` pour les paragraphes
- `<label>` pour les labels de formulaire

## Voir aussi

- [04 - Couleurs](./04-colors.md) - Pour les couleurs de texte
- [02 - Header](./02-header.md) - Pour les titres de page
- [03 - Sections](./03-sections.md) - Pour les titres de section
- [09 - Formulaires](./09-forms.md) - Pour les labels
