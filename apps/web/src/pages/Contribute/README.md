# Page Contribuer - Structure

Cette page permet aux utilisateurs de contribuer en ajoutant ou mettant à jour des offres d'énergie.

## Structure des dossiers

```
Contribute/
├── components/          # Composants UI
│   ├── tabs/           # Composants des onglets
│   │   ├── MyContributions.tsx      # Liste des contributions de l'utilisateur
│   │   └── AllOffers.tsx            # Orchestrateur de l'édition des offres existantes
│   ├── alloffers/      # Sous-composants d'AllOffers
│   │   ├── ProviderSelector.tsx     # Choix du fournisseur (+ purge, nouveau fournisseur)
│   │   ├── NewProviderForm.tsx      # Création d'un fournisseur
│   │   ├── OfferTypeSelector.tsx    # Choix du type d'offre
│   │   ├── OfferGroupCard.tsx       # Groupe d'offres (nom, dates, puissances)
│   │   ├── OfferRow.tsx             # Ligne d'une puissance (prix éditables, actions)
│   │   ├── PriceFieldsEditor.tsx    # Champs de prix d'une nouvelle puissance
│   │   ├── NewGroupForm.tsx         # Nouveau groupe d'offres
│   │   ├── ExpiredOffersSection.tsx # Offres expirées (réactivation, suppression)
│   │   ├── AIImportPanel.tsx        # Import JSON généré par une IA
│   │   ├── RecapModal.tsx           # Récapitulatif avant envoi
│   │   └── ConfirmDialog.tsx        # Confirmation avant perte des modifications
│   ├── forms/          # Composants de formulaires
│   │   └── PowerVariantForm.tsx     # Formulaire pour les variantes de puissance
│   ├── cards/          # Composants de cartes
│   │   └── ContributionCard.tsx     # Affichage d'une contribution
│   └── index.ts        # Barrel export
├── hooks/              # Hooks React personnalisés
│   ├── useContributions.ts          # Récupération des contributions
│   ├── useProviders.ts              # Récupération des fournisseurs
│   ├── useOffers.ts                 # Récupération des offres
│   ├── useContributionForm.ts       # Gestion du formulaire
│   ├── useAllOffersState.ts         # État partagé d'AllOffers (filtres, modifications, groupes)
│   ├── useOfferSubmission.ts        # Construction et envoi des contributions
│   ├── useAIImport.ts               # Import IA : validation, rapprochement, déduplication
│   └── index.ts        # Barrel export
├── types/              # Types TypeScript
│   ├── contribute.types.ts          # Définitions de types
│   ├── allOffers.types.ts           # Types et libellés d'AllOffers
│   └── index.ts        # Barrel export
├── utils/              # Fonctions utilitaires
│   ├── contribute.utils.ts          # Fonctions helpers
│   ├── offerPricing.ts              # Champs de prix par type, nom commercial, périodes
│   ├── aiPrompt.ts                  # Prompt de l'import IA
│   └── index.ts        # Barrel export
├── index.tsx           # Composant principal
└── README.md           # Documentation (ce fichier)
```

## Composants principaux

### MyContributions

Liste des contributions de l'utilisateur avec accordéons par statut.

**Fonctionnalités** :

- Groupement par statut (en attente / approuvées / rejetées)
- Chat WhatsApp-style pour communiquer avec les admins
- Édition des contributions en attente ou rejetées
- Rafraîchissement auto toutes les 10 secondes

### AllOffers

Interface d'édition inline des offres existantes pour soumettre des mises à jour de tarifs.

**Fonctionnalités** :

- Filtrage par fournisseur et type d'offre
- Édition inline des prix et des dates de validité d'un groupe
- Nouveaux groupes, nouvelles puissances, nouveau fournisseur
- Import d'un JSON multi-offres généré par une IA
- Offres expirées : réactivation, suppression
- Récapitulatif des modifications avant envoi
- Soumission groupée de contributions

Le nom d'une offre est son nom commercial seul (`getCleanOfferName`) : la puissance est
dans `power_kva` et l'option dans `offer_type`. Le backend applique les mêmes règles
(`apps/api/src/services/offer_names.py`).
Seule exception : « Option Flex » reste dans le nom (« Zen Week-End - Option Flex »), car l'export
Home Assistant s'en sert pour reconnaître une offre Zen Flex servie en `SEASONAL`.

## Hooks personnalisés

### useContributions

Récupère les contributions de l'utilisateur depuis l'API.

```tsx
const { contributions, isLoading, error, invalidateContributions } = useContributions()
```

### useProviders

Récupère la liste des fournisseurs d'énergie.

```tsx
const { providers, isLoading, error } = useProviders()
```

### useOffers

Récupère toutes les offres d'énergie disponibles.

```tsx
const { offers, isLoading, error } = useOffers()
```

### useContributionForm

Gère l'état du formulaire de contribution.

```tsx
const { formState, setFormState, handleFormStateChange, resetForm } = useContributionForm()
```

## Types principaux

### PowerVariant

Représente une variante de puissance pour une offre.

```typescript
interface PowerVariant {
  power_kva: number
  subscription_price: number
  pricing_data?: {
    base_price?: number
    hc_price?: number
    hp_price?: number
    tempo_blue_hc?: number
    // ... autres prix selon le type d'offre
  }
}
```

### TabType

Type des onglets de la page.

```typescript
type TabType = 'mine' | 'offers'
```

## Utilitaires

### formatPrice

Formate un prix en euros avec 4 décimales.

```typescript
formatPrice(0.1234) // "0.1234 €/kWh"
```

### getOfferTypeLabel

Retourne le label français d'un type d'offre.

```typescript
getOfferTypeLabel('HC_HP') // "Heures Creuses / Heures Pleines"
```

## Flux de données

```
index.tsx (état global)
    ↓
TabNavigation (navigation)
    ↓
MyContributions / AllOffers (onglets)
    ↓
Hooks (useContributions, useProviders, useOffers)
    ↓
API (@/api/energy)
```

## Conventions

1. **Imports relatifs** : Utiliser `../../` pour remonter vers la racine de `Contribute/`
2. **Barrel exports** : Importer depuis `./components` et `./hooks` plutôt que des chemins directs
3. **Props typées** : Toujours définir les interfaces pour les props
4. **Naming** : PascalCase pour les composants, camelCase pour les fonctions
