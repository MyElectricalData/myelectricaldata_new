# Formulaires

## Vue d'ensemble

Les formulaires incluent les inputs, selects, checkboxes, radios et labels. Ils doivent être accessibles, clairs et cohérents visuellement.

## Règles

1. Classe `.input` pour tous les champs (définie dans index.css)
2. Labels TOUJOURS au-dessus des champs avec `mb-1 block`
3. Toujours inclure dark mode
4. Focus states obligatoires pour l'accessibilité
5. Messages d'erreur en rouge sous les champs

## Classe Input Standard

### Définie dans index.css

```css
.input {
  w-full px-4 py-2 rounded-xl border border-gray-300
  bg-white text-gray-900
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
  dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100
}
```

## Code de référence

### Input Text

```tsx
<div className="mb-4">
  <label
    htmlFor="email"
    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
  >
    Email
  </label>
  <input
    id="email"
    type="email"
    className="input"
    placeholder="votre@email.com"
  />
</div>
```

### Select

```tsx
<div className="mb-4">
  <label
    htmlFor="pdl"
    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
  >
    Point de Livraison
  </label>
  <select id="pdl" className="input">
    <option value="">Sélectionnez un PDL</option>
    <option value="1">PDL 123456789</option>
    <option value="2">PDL 987654321</option>
  </select>
</div>
```

### Checkbox

```tsx
<div className="flex items-center gap-2">
  <input
    type="checkbox"
    id="agree"
    className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
  />
  <label
    htmlFor="agree"
    className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
  >
    J'accepte les conditions
  </label>
</div>
```

### Radio

```tsx
<div className="space-y-2">
  <div className="flex items-center gap-2">
    <input
      type="radio"
      id="option1"
      name="options"
      value="1"
      className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 focus:ring-primary-500"
    />
    <label
      htmlFor="option1"
      className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
    >
      Option 1
    </label>
  </div>
  <div className="flex items-center gap-2">
    <input
      type="radio"
      id="option2"
      name="options"
      value="2"
      className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 focus:ring-primary-500"
    />
    <label
      htmlFor="option2"
      className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
    >
      Option 2
    </label>
  </div>
</div>
```

### Textarea

```tsx
<div className="mb-4">
  <label
    htmlFor="message"
    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
  >
    Message
  </label>
  <textarea
    id="message"
    rows={4}
    className="input"
    placeholder="Votre message..."
  />
</div>
```

## Exemples d'utilisation

### Formulaire Complet

```tsx
<form onSubmit={handleSubmit} className="space-y-4">
  {/* Input Text */}
  <div>
    <label
      htmlFor="name"
      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
    >
      Nom complet
    </label>
    <input
      id="name"
      type="text"
      className="input"
      placeholder="Jean Dupont"
      required
    />
  </div>

  {/* Input Email */}
  <div>
    <label
      htmlFor="email"
      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
    >
      Email
    </label>
    <input
      id="email"
      type="email"
      className="input"
      placeholder="jean@example.com"
      required
    />
  </div>

  {/* Select */}
  <div>
    <label
      htmlFor="country"
      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
    >
      Pays
    </label>
    <select id="country" className="input" required>
      <option value="">Sélectionnez un pays</option>
      <option value="FR">France</option>
      <option value="BE">Belgique</option>
    </select>
  </div>

  {/* Checkbox */}
  <div className="flex items-center gap-2">
    <input
      type="checkbox"
      id="newsletter"
      className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
    />
    <label
      htmlFor="newsletter"
      className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
    >
      S'abonner à la newsletter
    </label>
  </div>

  {/* Boutons */}
  <div className="flex gap-2 justify-end pt-4">
    <button type="button" className="btn btn-secondary">
      Annuler
    </button>
    <button type="submit" className="btn btn-primary">
      Enregistrer
    </button>
  </div>
</form>
```

### Input avec Message d'Aide

```tsx
<div className="mb-4">
  <label
    htmlFor="password"
    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
  >
    Mot de passe
  </label>
  <input
    id="password"
    type="password"
    className="input"
    placeholder="••••••••"
  />
  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
    Minimum 8 caractères avec une majuscule et un chiffre
  </p>
</div>
```

### Input avec Erreur

```tsx
<div className="mb-4">
  <label
    htmlFor="email"
    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
  >
    Email
  </label>
  <input
    id="email"
    type="email"
    className="input border-red-500 dark:border-red-500"
    placeholder="votre@email.com"
    aria-invalid="true"
    aria-describedby="email-error"
  />
  <p id="email-error" className="text-xs text-red-600 dark:text-red-400 mt-1">
    Veuillez entrer une adresse email valide
  </p>
</div>
```

### Input avec Icône

```tsx
<div className="mb-4">
  <label
    htmlFor="search"
    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
  >
    Rechercher
  </label>
  <div className="relative">
    <Search
      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
      size={18}
    />
    <input
      id="search"
      type="text"
      className="input pl-10"
      placeholder="Rechercher..."
    />
  </div>
</div>
```

### Input Disabled

```tsx
<div className="mb-4">
  <label
    htmlFor="disabled"
    className="block text-sm font-medium text-gray-400 dark:text-gray-500 mb-1"
  >
    Champ désactivé
  </label>
  <input
    id="disabled"
    type="text"
    className="input opacity-60 cursor-not-allowed"
    value="Valeur non modifiable"
    disabled
  />
</div>
```

### Groupe de Checkboxes

```tsx
<div className="mb-4">
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
    Préférences
  </label>
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="pref1"
        className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
      />
      <label
        htmlFor="pref1"
        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
      >
        Notifications par email
      </label>
    </div>
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="pref2"
        className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
      />
      <label
        htmlFor="pref2"
        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
      >
        Notifications push
      </label>
    </div>
  </div>
</div>
```

## À ne pas faire

### Label sans attribut for

```tsx
// ❌ INCORRECT
<label className="block text-sm font-medium mb-1">
  Email
</label>
<input type="email" className="input" />

// ✅ CORRECT
<label htmlFor="email" className="block text-sm font-medium mb-1">
  Email
</label>
<input id="email" type="email" className="input" />
```

### Input sans dark mode

```tsx
// ❌ INCORRECT
<input className="w-full px-4 py-2 border border-gray-300 rounded-xl" />

// ✅ CORRECT
<input className="input" />
```

### Checkbox sans label cliquable

```tsx
// ❌ INCORRECT
<input type="checkbox" id="check" />
<span>Label</span>

// ✅ CORRECT
<input type="checkbox" id="check" />
<label htmlFor="check" className="cursor-pointer">Label</label>
```

### Pas de focus state

```tsx
// ❌ INCORRECT
<input className="w-full px-4 py-2 border rounded-xl" />

// ✅ CORRECT
<input className="input" /> // Inclut focus:ring-2 focus:ring-primary-500
```

### Erreur sans aria

```tsx
// ❌ INCORRECT
<input className="input border-red-500" />
<p className="text-red-600">Erreur</p>

// ✅ CORRECT
<input
  className="input border-red-500"
  aria-invalid="true"
  aria-describedby="error-message"
/>
<p id="error-message" className="text-red-600">Erreur</p>
```

## Accessibilité

### Attributs Requis

```tsx
<input
  id="field"
  type="text"
  className="input"
  aria-label="Description du champ"
  aria-required="true"
  aria-invalid={hasError}
  aria-describedby="field-help"
/>
```

### Focus Visible

```tsx
// La classe .input inclut déjà :
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
```

## Voir aussi

- [05 - Typographie](./05-typography.md) - Pour les labels
- [04 - Couleurs](./04-colors.md) - Pour les couleurs de formulaire
- [11 - États](./11-states.md) - Pour les états focus et disabled
- [07 - Boutons](./07-buttons.md) - Pour les boutons de formulaire
