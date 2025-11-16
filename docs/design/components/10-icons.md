# Icônes (Lucide React)

## Vue d'ensemble

Toutes les icônes de l'application utilisent la bibliothèque Lucide React. Elles doivent être cohérentes en taille et en couleur.

## Règles

1. Utiliser uniquement Lucide React (`lucide-react`)
2. Tailles standard : 16, 18, 20, 32, 48
3. Couleur primaire : `text-primary-600 dark:text-primary-400`
4. Toujours inclure la variante dark mode
5. Size correspond au contexte (H1=32, H2=20, bouton=16-18)

## Installation

```bash
npm install lucide-react
```

## Import

```tsx
import { TrendingUp, Settings, Download, Loader2 } from 'lucide-react'
```

## Tailles d'Icônes

### Par Contexte

| Contexte | Size | Utilisation |
|----------|------|-------------|
| Titre principal (H1) | 32 | Header de page |
| Section (H2) | 20 | Titre de section/card |
| Bouton | 16-18 | Icône dans bouton |
| Texte inline | 16 | Icône dans texte |
| État vide | 48 | Empty state |

## Couleurs d'Icônes

### Primaire

```tsx
className="text-primary-600 dark:text-primary-400"
```

### Secondaire

```tsx
className="text-gray-600 dark:text-gray-400"
```

### Dans Bouton Primaire

```tsx
className="text-white"
```

### État Désactivé

```tsx
className="text-gray-400 dark:text-gray-500"
```

## Code de référence

### Titre H1

```tsx
<h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
  <TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
  Consommation
</h1>
```

### Titre H2 (Section)

```tsx
<h2 className="text-lg font-semibold flex items-center gap-2">
  <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
  Statistiques
</h2>
```

### Bouton

```tsx
<button className="btn btn-primary flex items-center gap-2">
  <Download size={18} />
  Télécharger
</button>
```

### Loading

```tsx
<Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
```

### Empty State

```tsx
<TrendingUp className="mx-auto text-gray-400 mb-4" size={48} />
```

## Icônes Courantes

### Navigation et Actions

```tsx
import {
  Home,           // Accueil
  Settings,       // Paramètres
  User,           // Utilisateur
  Users,          // Utilisateurs
  LogOut,         // Déconnexion
  Menu,           // Menu hamburger
  X,              // Fermer
  ChevronDown,    // Chevron bas
  ChevronUp,      // Chevron haut
  ChevronLeft,    // Précédent
  ChevronRight,   // Suivant
} from 'lucide-react'
```

### Données et Graphiques

```tsx
import {
  TrendingUp,     // Consommation/Tendance
  TrendingDown,   // Diminution
  BarChart3,      // Statistiques/Graphiques
  Activity,       // Activité
  Zap,            // Production/Électricité
  Calendar,       // Dates
  Clock,          // Temps
} from 'lucide-react'
```

### Actions et Commandes

```tsx
import {
  Download,       // Télécharger
  Upload,         // Uploader
  RefreshCw,      // Rafraîchir
  Search,         // Rechercher
  Filter,         // Filtrer
  Trash2,         // Supprimer
  Edit,           // Éditer
  Plus,           // Ajouter
  Minus,          // Retirer
  Check,          // Valider
} from 'lucide-react'
```

### Statut et Info

```tsx
import {
  Info,           // Information
  AlertCircle,    // Avertissement
  CheckCircle,    // Succès
  XCircle,        // Erreur
  HelpCircle,     // Aide
  Loader2,        // Chargement (avec animate-spin)
} from 'lucide-react'
```

### Fichiers et Documents

```tsx
import {
  FileText,       // Document/Logs
  Code,           // Code/API
  Download,       // Export
  Upload,         // Import
} from 'lucide-react'
```

### Autres

```tsx
import {
  Calculator,     // Simulateur
  Gift,           // Contributions
  LayoutDashboard, // Dashboard
  Eye,            // Voir
  EyeOff,         // Cacher
  ArrowUp,        // Tri ascendant
  ArrowDown,      // Tri descendant
  ArrowUpDown,    // Tri
} from 'lucide-react'
```

## Exemples d'utilisation

### Par Page

```tsx
// Consumption
<TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />

// Production
<Zap className="text-primary-600 dark:text-primary-400" size={32} />

// Simulator
<Calculator className="text-primary-600 dark:text-primary-400" size={32} />

// Settings
<Settings className="text-primary-600 dark:text-primary-400" size={32} />

// Admin Users
<Users className="text-primary-600 dark:text-primary-400" size={32} />

// Admin Logs
<FileText className="text-primary-600 dark:text-primary-400" size={32} />

// Ecowatt
<Activity className="text-primary-600 dark:text-primary-400" size={32} />

// Tempo
<Calendar className="text-primary-600 dark:text-primary-400" size={32} />

// FAQ
<HelpCircle className="text-primary-600 dark:text-primary-400" size={32} />

// API Docs
<Code className="text-primary-600 dark:text-primary-400" size={32} />
```

### Icônes avec Animation

```tsx
// Chargement
<Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />

// Rafraîchir (rotation au clic)
<RefreshCw className="transition-transform hover:rotate-180" size={18} />

// Chevron (rotation selon état)
<ChevronDown
  className={`transition-transform duration-200 ${
    isExpanded ? "rotate-180" : ""
  }`}
  size={20}
/>
```

### Icônes dans Tableau

```tsx
<th className="cursor-pointer" onClick={() => handleSort('date')}>
  <div className="flex items-center gap-1">
    <span>Date</span>
    {sortBy === 'date' ? (
      sortOrder === 'asc' ? (
        <ArrowUp size={14} />
      ) : (
        <ArrowDown size={14} />
      )
    ) : (
      <ArrowUpDown size={14} className="opacity-40" />
    )}
  </div>
</th>
```

### Icône de Statut

```tsx
{status === 'success' && (
  <CheckCircle className="text-green-600 dark:text-green-400" size={16} />
)}
{status === 'error' && (
  <XCircle className="text-red-600 dark:text-red-400" size={16} />
)}
{status === 'warning' && (
  <AlertCircle className="text-yellow-600 dark:text-yellow-400" size={16} />
)}
```

## À ne pas faire

### Taille incorrecte selon contexte

```tsx
// ❌ INCORRECT - H1 avec petite icône
<h1 className="text-3xl font-bold flex items-center gap-3">
  <TrendingUp size={20} />
  Titre
</h1>

// ✅ CORRECT
<h1 className="text-3xl font-bold flex items-center gap-3">
  <TrendingUp size={32} />
  Titre
</h1>
```

### Pas de dark mode

```tsx
// ❌ INCORRECT
<TrendingUp className="text-primary-600" size={32} />

// ✅ CORRECT
<TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
```

### Icône sans size

```tsx
// ❌ INCORRECT - Utilise la taille par défaut (24)
<Download className="text-primary-600" />

// ✅ CORRECT
<Download className="text-primary-600 dark:text-primary-400" size={18} />
```

### Mauvaise bibliothèque

```tsx
// ❌ INCORRECT - N'utilisez pas d'autres bibliothèques
import { FaHome } from 'react-icons/fa'

// ✅ CORRECT
import { Home } from 'lucide-react'
```

## Accessibilité

### Icône Décorative

```tsx
<TrendingUp aria-hidden="true" size={20} />
```

### Icône Sémantique

```tsx
<button aria-label="Télécharger le fichier">
  <Download size={18} />
</button>
```

## Voir aussi

- [02 - Header](./02-header.md) - Pour les icônes de titre
- [03 - Sections](./03-sections.md) - Pour les icônes de section
- [07 - Boutons](./07-buttons.md) - Pour les icônes dans boutons
- [04 - Couleurs](./04-colors.md) - Pour les couleurs d'icônes
