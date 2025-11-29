z# Checklist pour Nouvelle Page

## Vue d'ensemble

Cette checklist garantit que chaque nouvelle page ou modification respecte les standards de design de l'application.

## Avant de Commencer

- [ ] Consulter le [Guide de Design](./design-guidelines.md)
- [ ] Consulter les [Composants](./components/README.md)
- [ ] Regarder une page de référence (ex: Consumption)
- [ ] Identifier les patterns UX à utiliser

## Structure de Page

### Container Principal

- [ ] Container avec `w-full`
- [ ] Espacement cohérent entre sections (`mt-6`)
- [ ] Padding latéral géré par Layout (ne pas ajouter `px-*`)

**Référence:** [01 - Container](./components/01-container.md)

### Header de Page

**⚠️ Important : Les pages Admin n'ont PAS besoin d'ajouter leur propre header H1.**
Le header est géré automatiquement par le Layout via la configuration des routes.

Pour les **pages non-Admin** uniquement :
- [ ] H1 avec `text-3xl font-bold mb-2 flex items-center gap-3`
- [ ] Icône avec `text-primary-600 dark:text-primary-400` et `size={32}`
- [ ] Sous-titre avec `text-gray-600 dark:text-gray-400`
- [ ] Espacement `mb-6` après l'en-tête

**Référence:** [02 - Header](./components/02-header.md)

### Sections

- [ ] Utiliser le pattern de section collapsible si nécessaire
- [ ] Card avec `rounded-xl shadow-md border`
- [ ] Padding `p-6` pour header
- [ ] Padding `px-6 pb-6` pour contenu
- [ ] Espacement vertical `space-y-8` dans le contenu

**Référence:** [03 - Sections](./components/03-sections.md)

## Couleurs

### Texte

- [ ] Titre principal : `text-gray-900 dark:text-white`
- [ ] Texte secondaire : `text-gray-600 dark:text-gray-400`
- [ ] Texte désactivé : `text-gray-400 dark:text-gray-500`

### Fond

- [ ] Fond de carte : `bg-white dark:bg-gray-800`
- [ ] Fond hover : `hover:bg-gray-100 dark:hover:bg-gray-700`

### Bordures

- [ ] Bordure standard : `border-gray-300 dark:border-gray-700`
- [ ] Bordure input : `border-gray-300 dark:border-gray-600`

### Couleur Primaire

- [ ] Icônes/Liens : `text-primary-600 dark:text-primary-400`
- [ ] Boutons : `bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600`

**Référence:** [04 - Couleurs](./components/04-colors.md)

## Typographie

- [ ] H1 : `text-3xl font-bold`
- [ ] H2 : `text-lg font-semibold`
- [ ] Body : `text-base` (par défaut)
- [ ] Small : `text-sm`
- [ ] Extra Small : `text-xs`

**Référence:** [05 - Typographie](./components/05-typography.md)

## Espacement

- [ ] Entre sections : `mt-6`
- [ ] Après header de page : `mb-6`
- [ ] Card header : `p-6`
- [ ] Card content : `px-6 pb-6`
- [ ] Titre avec icône : `gap-3`
- [ ] Éléments inline : `gap-2`
- [ ] Contenu de section : `space-y-8`

**Référence:** [06 - Espacement](./components/06-spacing.md)

## Composants

### Boutons

- [ ] Utiliser `.btn .btn-primary` ou `.btn .btn-secondary`
- [ ] Icônes de taille 16-18px dans les boutons
- [ ] Gap de 2 entre icône et texte
- [ ] État disabled avec `opacity-60 cursor-not-allowed`
- [ ] Loading avec `Loader2` et `animate-spin`

**Référence:** [07 - Boutons](./components/07-buttons.md)

### Cards

- [ ] Classes complètes : `bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-300 dark:border-gray-700 transition-colors duration-200`
- [ ] Padding cohérent `p-6`
- [ ] Espacement entre cards `mt-6`

**Référence:** [08 - Cards](./components/08-cards.md)

### Formulaires

- [ ] Classe `.input` pour tous les champs
- [ ] Labels avec `htmlFor` et `mb-1 block`
- [ ] Labels : `text-sm font-medium text-gray-700 dark:text-gray-300`
- [ ] Messages d'aide : `text-xs text-gray-500 dark:text-gray-400 mt-1`
- [ ] Messages d'erreur : `text-xs text-red-600 dark:text-red-400 mt-1`

**Référence:** [09 - Formulaires](./components/09-forms.md)

### Icônes

- [ ] Import de `lucide-react`
- [ ] Titre H1 : `size={32}`
- [ ] Titre H2 : `size={20}`
- [ ] Boutons : `size={16}` ou `size={18}`
- [ ] Empty state : `size={48}`
- [ ] Couleur : `text-primary-600 dark:text-primary-400`

**Référence:** [10 - Icônes](./components/10-icons.md)

## États Interactifs

### Hover

- [ ] Boutons : `hover:bg-primary-700 dark:hover:bg-primary-600`
- [ ] Liens : `hover:text-primary-600 dark:hover:text-primary-400`
- [ ] Cards : `hover:shadow-lg`
- [ ] Transitions : `transition-colors duration-200`

### Focus

- [ ] Focus ring : `focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`
- [ ] Tous les éléments interactifs doivent avoir un focus visible

### Disabled

- [ ] Visual feedback : `opacity-60 cursor-not-allowed`
- [ ] Désactiver les clics : `disabled` ou vérification dans `onClick`

### Loading

- [ ] Icône `Loader2` avec `animate-spin`
- [ ] Couleur : `text-primary-600 dark:text-primary-400`
- [ ] Désactiver les interactions pendant le chargement

**Référence:** [11 - États](./components/11-states.md)

## Dark Mode

- [ ] Tous les textes ont une variante dark mode
- [ ] Tous les backgrounds ont une variante dark mode
- [ ] Toutes les bordures ont une variante dark mode
- [ ] Toutes les icônes ont une variante dark mode
- [ ] Tester visuellement en dark mode
- [ ] Vérifier le contraste en dark mode
- [ ] Graphiques/charts adaptés au dark mode

**Référence:** [14 - Dark Mode](./components/14-dark-mode.md)

## Responsive

- [ ] Approche mobile-first
- [ ] Tester sur mobile (375px)
- [ ] Tester sur tablette (768px)
- [ ] Tester sur desktop (1280px+)
- [ ] Grids responsive : `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- [ ] Flex responsive : `flex-col md:flex-row`
- [ ] Padding responsive si nécessaire : `p-4 md:p-6`
- [ ] Tableaux deviennent cards sur mobile si complexes

**Référence:** [15 - Responsive](./components/15-responsive.md)

## Patterns UX Spécifiques

### Sections Always Visible

Si la page a des sections avec données :

- [ ] Sections toujours visibles dès le chargement
- [ ] État disabled avec `opacity-60 cursor-not-allowed` sans données
- [ ] État enabled avec `cursor-pointer` avec données
- [ ] Sections pliées par défaut si pas de données

### Détection de Cache

Si la page charge des données :

- [ ] Détection de cache implémentée
- [ ] Composant de progression affiché si cache détecté
- [ ] Message adapté selon cache (chargement vs mise à jour)

### Écran de chargement avec placeholder

Si la page a un écran de chargement initial :

- [ ] Utiliser `LoadingOverlay` avec `LoadingPlaceholder` en enfant
- [ ] Le placeholder affiche des données fictives floutées
- [ ] L'overlay a un fond semi-transparent (`bg-white/30`)
- [ ] Animation de sortie fluide (`isExiting`)

```tsx
<LoadingOverlay dataType="consumption" isExiting={isLoadingExiting}>
  <LoadingPlaceholder type="consumption" />
</LoadingOverlay>
```

**Référence:** [13 - Loading](./components/loading.md#loadingplaceholder--contenu-flouté-en-arrière-plan)

### Transitions de page

Toutes les pages bénéficient automatiquement des transitions via `PageTransition` dans Layout :

- [ ] Animation sortie : fade out + slide up (150ms)
- [ ] Scroll automatique vers le haut
- [ ] Animation entrée : fade in + slide down (300ms)
- [ ] Pas de flash de contenu (pattern `isInitializing`)

**Référence:** [13 - Loading](./components/loading.md#pagetransition--transitions-fluides-entre-pages)

### Filtres

Si la page a des filtres :

- [ ] Pattern compact avec fond gris
- [ ] Icône Filter en début
- [ ] Labels en `text-xs`
- [ ] Bouton réinitialiser si filtres actifs

**Référence:** [12 - Filtres](./components/12-filters.md)

## Accessibilité

- [ ] Tous les inputs ont un `label` avec `htmlFor`
- [ ] Tous les boutons icône ont `aria-label`
- [ ] Éléments interactifs accessibles au clavier (`tabIndex={0}`)
- [ ] `onKeyPress` pour éléments cliquables non-button
- [ ] Contrastes suffisants (WCAG AA minimum)
- [ ] Focus states visibles
- [ ] Messages d'erreur avec `aria-describedby`
- [ ] États avec `aria-disabled`, `aria-busy`, etc.

## Performance

- [ ] Images optimisées
- [ ] Lazy loading des composants lourds
- [ ] useMemo pour calculs coûteux
- [ ] useCallback pour fonctions passées aux enfants
- [ ] Éviter les re-renders inutiles

## Tests

- [ ] Tester en light mode
- [ ] Tester en dark mode
- [ ] Tester sur différentes tailles d'écran
- [ ] Tester la navigation au clavier
- [ ] Tester les états loading
- [ ] Tester les états error
- [ ] Tester les états empty

## Documentation

- [ ] Ajouter des commentaires pour la logique complexe
- [ ] Documenter les props des composants
- [ ] Mettre à jour la navigation si nouvelle page
- [ ] Ajouter aux commandes Claude si pertinent

## Anti-Patterns à Éviter

- [ ] ❌ Pas de couleur sans variante dark
- [ ] ❌ Pas de tailles d'espacement non standard (mt-5, p-7)
- [ ] ❌ Pas de couleurs hardcodées (`style={{color: '#xxx'}}`)
- [ ] ❌ Pas de rounded non standard (rounded-2xl)
- [ ] ❌ Pas d'icônes sans couleur dark
- [ ] ❌ Pas de hover sans transition
- [ ] ❌ Pas de focus sans ring
- [ ] ❌ Pas de disabled sans visual feedback
- [ ] ❌ Pas de label sans `htmlFor`

## Validation Finale

- [ ] Revue du code par un pair
- [ ] Vérification des guidelines de design
- [ ] Test de tous les cas d'usage
- [ ] Vérification de la cohérence avec les autres pages
- [ ] Commit avec message clair

## Ressources

- [Guide de Design Principal](./design-guidelines.md)
- [Index des Composants](./components/README.md)
- [Exemples de Code](./examples.md)
- Améliorations UX 2025 intégrées dans :
  - [03 - Sections](./components/03-sections.md)
  - [11 - États](./components/11-states.md)
  - [13 - Loading](./components/13-loading.md)
- Page de référence : `apps/web/src/pages/Consumption/index.tsx`

---

**Note:** Cette checklist est vivante. N'hésitez pas à la mettre à jour si vous identifiez des points manquants ou obsolètes.
