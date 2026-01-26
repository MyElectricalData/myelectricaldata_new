# Dark Mode

## Vue d'ensemble

Le dark mode est géré par une classe `dark` sur l'élément `<html>`. Chaque composant DOIT inclure des variantes dark mode pour tous les éléments colorés.

## Règles

1. **TOUJOURS** fournir une variante dark pour chaque couleur
2. Maintenir le même ratio de contraste entre light et dark mode
3. Utiliser la classe `dark:` pour toutes les propriétés de couleur
4. Tester en mode sombre pour vérifier la lisibilité
5. Utiliser les classes Tailwind, pas de couleurs inline

## Détection du Dark Mode

### Pattern Standard

```tsx
const [isDarkMode, setIsDarkMode] = useState(false);

useEffect(() => {
  const checkDarkMode = () => {
    setIsDarkMode(document.documentElement.classList.contains("dark"));
  };
  
  // Check initial
  checkDarkMode();
  
  // Observer les changements
  const observer = new MutationObserver(checkDarkMode);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  
  return () => observer.disconnect();
}, []);
```

### Utilisation

```tsx
// Pour les bibliothèques externes (Recharts, etc.)
<BarChart data={data}>
  <CartesianGrid stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
  <XAxis stroke={isDarkMode ? '#9ca3af' : '#6b7280'} />
</BarChart>
```

## Code de référence

### Texte

```tsx
// Titre principal
<h1 className="text-gray-900 dark:text-white">

// Texte secondaire
<p className="text-gray-600 dark:text-gray-400">

// Texte désactivé
<span className="text-gray-400 dark:text-gray-500">
```

### Fond

```tsx
// Fond de carte
<div className="bg-white dark:bg-gray-800">

// Fond de page (géré par Layout)
<div className="bg-gray-50 dark:bg-gray-900">

// Fond hover
<div className="hover:bg-gray-100 dark:hover:bg-gray-700">
```

### Bordures

```tsx
// Bordure standard
<div className="border-gray-300 dark:border-gray-700">

// Bordure input
<input className="border-gray-300 dark:border-gray-600">
```

### Couleur Primaire

```tsx
// Icônes, liens
<Icon className="text-primary-600 dark:text-primary-400" />

// Boutons
<button className="bg-primary-600 dark:bg-primary-500 hover:bg-primary-700 dark:hover:bg-primary-600">
```

### Couleurs de Statut

```tsx
// Info
<div className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
  <p className="text-blue-800 dark:text-blue-200">Info</p>
</div>

// Success
<div className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
  <p className="text-green-800 dark:text-green-200">Succès</p>
</div>

// Warning
<div className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
  <p className="text-yellow-800 dark:text-yellow-200">Attention</p>
</div>

// Error
<div className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
  <p className="text-red-800 dark:text-red-200">Erreur</p>
</div>
```

## Exemples d'utilisation

### Card Complète

```tsx
<div className="
  bg-white dark:bg-gray-800
  border border-gray-300 dark:border-gray-700
  rounded-xl shadow-md
  transition-colors duration-200
  p-6
">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
    Titre de la Card
  </h2>
  <p className="text-gray-600 dark:text-gray-400">
    Contenu de la card
  </p>
</div>
```

### Formulaire

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
    Email
  </label>
  <input
    type="email"
    className="
      w-full px-4 py-2 rounded-xl
      bg-white dark:bg-gray-800
      border border-gray-300 dark:border-gray-600
      text-gray-900 dark:text-gray-100
      focus:outline-none focus:ring-2 focus:ring-primary-500
    "
  />
</div>
```

### Tableau

```tsx
<table className="w-full">
  <thead className="bg-gray-100 dark:bg-gray-700">
    <tr>
      <th className="p-3 text-left text-gray-700 dark:text-gray-300">
        Colonne
      </th>
    </tr>
  </thead>
  <tbody>
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <td className="p-3 text-gray-900 dark:text-white">
        Données
      </td>
    </tr>
  </tbody>
</table>
```

### Bouton

```tsx
<button className="
  bg-primary-600 dark:bg-primary-500
  hover:bg-primary-700 dark:hover:bg-primary-600
  text-white
  px-4 py-2 rounded-lg
  transition-colors
">
  Cliquer
</button>
```

## Patterns Avancés

### Opacité Adaptative

Pour les fonds semi-transparents, utiliser `/20` ou `/30` :

```tsx
<div className="bg-blue-900/20 dark:bg-blue-900/30">
```

### Gradient

```tsx
<div className="
  bg-gradient-to-r
  from-primary-500 to-primary-700
  dark:from-primary-400 dark:to-primary-600
">
```

### Shadow Adaptative

```tsx
<div className="
  shadow-md
  dark:shadow-gray-900/50
">
```

## Bibliothèques Externes

### Recharts

```tsx
const [isDarkMode, setIsDarkMode] = useState(false);

// Détection dark mode...

<BarChart data={data}>
  <CartesianGrid
    strokeDasharray="3 3"
    stroke={isDarkMode ? '#374151' : '#e5e7eb'}
  />
  <XAxis
    stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
    tick={{ fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
  />
  <YAxis
    stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
    tick={{ fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
  />
  <Tooltip
    contentStyle={{
      backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
      border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
      color: isDarkMode ? '#ffffff' : '#000000',
    }}
  />
  <Bar dataKey="value" fill={isDarkMode ? '#0ea5e9' : '#0284c7'} />
</BarChart>
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

### Couleurs inline

```tsx
// ❌ INCORRECT
<div style={{backgroundColor: '#ffffff'}}>
<p style={{color: '#666666'}}>

// ✅ CORRECT
<div className="bg-white dark:bg-gray-800">
<p className="text-gray-600 dark:text-gray-400">
```

### Contraste insuffisant

```tsx
// ❌ INCORRECT - Texte gris clair sur fond gris foncé
<div className="bg-gray-800">
  <p className="text-gray-700">Peu lisible</p>
</div>

// ✅ CORRECT
<div className="bg-gray-800">
  <p className="text-gray-100">Lisible</p>
</div>
```

### Oublier les icônes

```tsx
// ❌ INCORRECT
<Icon className="text-primary-600" />

// ✅ CORRECT
<Icon className="text-primary-600 dark:text-primary-400" />
```

## Test du Dark Mode

### Checklist

- [ ] Tous les textes sont lisibles en dark mode
- [ ] Tous les backgrounds ont une variante dark
- [ ] Toutes les bordures ont une variante dark
- [ ] Toutes les icônes ont une variante dark
- [ ] Les graphiques/charts sont adaptés
- [ ] Les hover states fonctionnent en dark mode
- [ ] Les focus states sont visibles en dark mode
- [ ] Les blocs d'information (info, warning, error) sont lisibles
- [ ] Les tableaux ont un bon contraste
- [ ] Les formulaires sont utilisables

### Tester Manuellement

1. Ouvrir la page en light mode
2. Vérifier tous les éléments
3. Basculer en dark mode
4. Vérifier que tout reste lisible et cohérent
5. Tester les interactions (hover, focus, etc.)

## Voir aussi

- [04 - Couleurs](./04-colors.md) - Pour la palette complète
- [08 - Cards](./08-cards.md) - Pour les cards en dark mode
- [09 - Formulaires](./09-forms.md) - Pour les formulaires en dark mode
- [11 - États](./11-states.md) - Pour les états en dark mode
