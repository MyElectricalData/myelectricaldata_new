# Guide de Design - MyElectricalData

Ce document définit les règles de design à respecter sur toutes les pages du site, basées sur la page Consumption.tsx de référence.

## 1. Structure de Page Standard

### En-tête de Page

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
    <IconComponent className="text-primary-600 dark:text-primary-400" size={32} />
    Titre de la Page
  </h1>
  <p className="text-gray-600 dark:text-gray-400">Description de la page</p>
</div>
```

**Règles :**

- H1 : `text-3xl font-bold mb-2 flex items-center gap-3`
- Icône : `text-primary-600 dark:text-primary-400` avec `size={32}`
- Sous-titre : `text-gray-600 dark:text-gray-400`
- Espacement : `mb-6` après l'en-tête

### Container Principal

```tsx
<div className="w-full">{/* Contenu de la page */}</div>
```

## 2. Sections Collapsibles (Pattern Réutilisable)

### Structure de Section

```tsx
<div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
  {/* Header cliquable */}
  <div
    className={`flex items-center justify-between p-6 cursor-pointer ${
      isLoading ? "opacity-60 cursor-not-allowed" : ""
    }`}
    onClick={() => {
      if (!isLoading) {
        setIsSectionExpanded(!isSectionExpanded);
      }
    }}
  >
    {/* Titre avec icône */}
    <div className="flex items-center gap-2">
      <IconComponent className="text-primary-600 dark:text-primary-400" size={20} />
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Titre de la Section</h2>
    </div>

    {/* Indicateur Réduire/Développer */}
    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
      {isSectionExpanded ? <span className="text-sm">Réduire</span> : <span className="text-sm">Développer</span>}
      <svg
        className={`w-5 h-5 transition-transform duration-200 ${isSectionExpanded ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>

  {/* Contenu */}
  {isSectionExpanded && <div className="px-6 pb-6 space-y-8">{/* Contenu de la section */}</div>}
</div>
```

**Règles :**

- Card : `mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200`
- Header : `flex items-center justify-between p-6 cursor-pointer`
- H2 : `text-lg font-semibold text-gray-900 dark:text-white`
- Icône de section : `size={20}` (plus petit que le titre principal)
- Padding du contenu : `px-6 pb-6`
- Espacement vertical du contenu : `space-y-8`
- État désactivé : `opacity-60 cursor-not-allowed`
- Animation du chevron : `transition-transform duration-200` avec `rotate-180`

## 3. Palette de Couleurs

### Couleur Primaire (Bleu Ciel)

```css
Primary-600: #0284c7   /* Couleur principale (light mode) */
Primary-400: #0ea5e9   /* Couleur principale (dark mode) */
Primary-500: #0ea5e9   /* Variante light */
Primary-700: #0369a1   /* Variante dark */
```

### Couleurs de Texte

```css
/* Light Mode */
Titre principal: text-gray-900
Texte secondaire: text-gray-600
Texte désactivé: text-gray-400

/* Dark Mode */
Titre principal: dark:text-white
Texte secondaire: dark:text-gray-400
Texte désactivé: dark:text-gray-500
```

### Couleurs de Fond

```css
/* Light Mode */
Fond de carte: bg-white
Fond de page: (inherited from Layout)

/* Dark Mode */
Fond de carte: dark:bg-gray-800
Fond de page: (inherited from Layout)
```

### Couleurs de Bordure

```css
/* Light Mode */
border-gray-300

/* Dark Mode */
dark:border-gray-700
```

### Couleurs de Statut

```css
/* Info */
bg-blue-50 dark:bg-blue-900/20
border-blue-200 dark:border-blue-800
text-blue-800 dark:text-blue-200

/* Success */
bg-green-50 dark:bg-green-900/20
border-green-200 dark:border-green-800
text-green-800 dark:text-green-200

/* Warning */
bg-yellow-50 dark:bg-yellow-900/20
border-yellow-200 dark:border-yellow-800
text-yellow-800 dark:text-yellow-200

/* Error */
bg-red-50 dark:bg-red-900/20
border-red-200 dark:border-red-800
text-red-800 dark:text-red-200
```

## 4. Typographie

### Tailles de Police

```css
H1 (Page Title): text-3xl (30px)
H2 (Section Title): text-lg (18px)
Body: text-base (16px)
Small: text-sm (14px)
Extra Small: text-xs (12px)
```

### Poids de Police

```css
Title: font-bold (700)
Section Header: font-semibold (600)
Body: font-normal (400) - default
Medium: font-medium (500)
```

## 5. Espacement

### Marges

```css
Entre sections: mt-6 (24px)
Après header de page: mb-6 (24px)
Entre éléments d'une section: mb-2, mb-3, mb-4
```

### Padding

```css
Card header: p-6 (24px)
Card content: px-6 pb-6 (24px horizontal, 24px bottom)
Éléments internes: p-4 (16px)
```

### Gaps et Space

```css
Titre avec icône: gap-3 (12px)
Éléments inline: gap-2 (8px)
Contenu de section: space-y-8 (32px vertical)
Entre sous-éléments: space-y-4 (16px vertical)
```

## 6. Coins Arrondis

### Tailles Standard

```css
Cards principales: rounded-xl (12px)
Éléments internes: rounded-lg (8px)
Petits éléments: rounded-md (6px)
```

## 7. Ombres

### Cards

```css
shadow-md  /* Ombre moyenne pour les cards */
```

## 8. Transitions et Animations

### Transitions Standard

```css
Couleurs: transition-colors duration-200
Tout: transition-all duration-200
Transform: transition-transform duration-200
```

### Animations

```css
Rotation chevron: rotate-180
Loading: animate-pulse
Fade-in: animate-in fade-in duration-300
```

## 9. États Interactifs

### Hover

```css
Bouton: hover:bg-primary-700 dark:hover:bg-primary-600
Lien: hover:text-primary-600 dark:hover:text-primary-400
Card: hover:shadow-lg
```

### Focus

```css
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
```

### Disabled/Loading

```css
opacity-60 cursor-not-allowed
```

## 10. Icônes (Lucide React)

### Tailles d'Icônes

```css
Titre principal (H1): size={32}
Section (H2): size={20}
Boutons: size={18} ou size={16}
Inline text: size={16}
```

### Couleurs d'Icônes

```css
Primaire: text-primary-600 dark:text-primary-400
Secondaire: text-gray-600 dark:text-gray-400
Dans bouton primaire: text-white
```

### Icônes Courantes

- TrendingUp: Consommation, Puissance
- BarChart3: Statistiques, Graphiques
- Calendar: Dates
- Info: Information
- AlertCircle: Avertissement
- Loader2: Chargement (avec animate-spin)
- Download: Export
- Trash2: Suppression

## 11. Blocs d'Information

### Structure Standard

```tsx
<div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
  <p className="text-sm text-blue-800 dark:text-blue-200">
    <strong>ℹ️ Note :</strong> Votre message d'information
  </p>
</div>
```

**Règles :**

- Padding : `p-4`
- Rounded : `rounded-lg`
- Texte : `text-sm`
- Utiliser les couleurs de statut appropriées (info, warning, success, error)

## 12. État Vide (Empty State)

### Structure Standard

```tsx
{
  !data && !isLoading && (
    <div className="card mt-6 p-12 text-center">
      <IconComponent className="mx-auto text-gray-400 mb-4" size={48} />
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Titre de l'état vide</h3>
      <p className="text-gray-600 dark:text-gray-400">Message explicatif</p>
    </div>
  );
}
```

**Règles :**

- Centré : `text-center`
- Padding généreux : `p-12`
- Icône : `size={48}` en gris (`text-gray-400`)
- H3 : `text-lg font-medium`

## 13. Composants Réutilisables

### Boutons

Utiliser les classes Tailwind standards définies dans `index.css` :

- `.btn` : Base
- `.btn-primary` : Action principale
- `.btn-secondary` : Action secondaire

### Inputs

```css
.input {
  w-full px-4 py-2 rounded-xl border border-gray-300
  bg-white text-gray-900
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
  dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100
}
```

### Cards

```css
.card {
  bg-white dark:bg-gray-800 rounded-xl shadow-md p-6
  border border-gray-300 dark:border-gray-700
  transition-colors duration-200
}
```

## 14. Dark Mode

### Règles Générales

- **TOUJOURS** fournir une variante dark pour chaque couleur
- Maintenir le même ratio de contraste
- Utiliser la classe `dark:` pour toutes les propriétés de couleur
- Tester en mode sombre pour vérifier la lisibilité

### Détection du Dark Mode

```tsx
const [isDarkMode, setIsDarkMode] = useState(false);

useEffect(() => {
  const checkDarkMode = () => {
    setIsDarkMode(document.documentElement.classList.contains("dark"));
  };
  checkDarkMode();
  const observer = new MutationObserver(checkDarkMode);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}, []);
```

## 15. Responsive Design

### Breakpoints Tailwind

```css
sm: 640px   /* Small devices */
md: 768px   /* Medium devices */
lg: 1024px  /* Large devices */
xl: 1280px  /* Extra large devices */
```

### Pattern Mobile-First

```tsx
{/* Mobile: colonne, Desktop: ligne */}
<div className="flex flex-col sm:flex-row gap-4">
```

## 16. Loading States

### Pattern Standard

```tsx
{
  isLoading && (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
    </div>
  );
}
```

## 17. Checklist pour Nouvelle Page

Avant de créer ou modifier une page, vérifier :

- [ ] En-tête avec H1 + icône + sous-titre
- [ ] Container principal avec `w-full`
- [ ] Sections collapsibles si contenu volumineux
- [ ] Tous les textes ont une variante dark mode
- [ ] Tous les fonds ont une variante dark mode
- [ ] Toutes les bordures ont une variante dark mode
- [ ] Icônes en `text-primary-600 dark:text-primary-400`
- [ ] Espacement cohérent (mt-6 entre sections, p-6 dans cards)
- [ ] Rounded-xl pour les cards principales
- [ ] Shadow-md pour les cards
- [ ] Transitions sur les couleurs (duration-200)
- [ ] États loading avec Loader2 + animate-spin
- [ ] Empty state centré avec icône size={48}
- [ ] Blocs d'information avec couleurs de statut appropriées
- [ ] Responsive (mobile-first)
- [ ] Focus states accessibles

## 18. Anti-Patterns à Éviter

### ❌ À NE PAS FAIRE

```tsx
// Pas de couleur sans variante dark
<div className="bg-white">

// Pas de tailles d'espacement non standard
<div className="mt-5">  // Utiliser mt-4 ou mt-6

// Pas de couleurs hardcodées
<div style={{color: '#0284c7'}}>  // Utiliser text-primary-600

// Pas de rounded non standard
<div className="rounded-2xl">  // Utiliser rounded-xl

// Pas d'icônes sans couleur dark
<Icon className="text-primary-600" />
```

### ✅ À FAIRE

```tsx
// Toujours avec dark mode
<div className="bg-white dark:bg-gray-800">

// Espacement standard
<div className="mt-6">

// Classes Tailwind
<div className="text-primary-600 dark:text-primary-400">

// Rounded standard
<div className="rounded-xl">

// Icônes complètes
<Icon className="text-primary-600 dark:text-primary-400" size={20} />
```

## 19. Exemples Complets

### Exemple 1 : Page Simple

```tsx
export default function MaPage() {
  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Settings className="text-primary-600 dark:text-primary-400" size={32} />
          Paramètres
        </h1>
        <p className="text-gray-600 dark:text-gray-400">Gérez vos préférences</p>
      </div>

      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 p-6">
        {/* Contenu */}
      </div>
    </div>
  );
}
```

### Exemple 2 : Section Collapsible

Voir la section 2 de ce document.

---

**Note finale :** Ce guide est basé sur [Consumption/index.tsx](../apps/web/src/pages/Consumption/index.tsx) et doit être respecté sur toutes les pages pour maintenir une cohérence visuelle dans l'application.
