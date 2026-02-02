---
name: offers
id: offers
path: /contribute/offers
description: Onglet offers des contribution
mode_client: false
mode_server: true
menu: Contribuer
tab: Toutes les offres
---

# Toutes les offres

Fichier : `apps/web/src/pages/Contribute/components/tabs/AllOffers.tsx`

## Features

| Feature                        | Statut |
| ------------------------------ | ------ |
| Mode lecture/edition           | FAIT   |
| Filtre par fournisseur         | FAIT   |
| Filtre par type d'offre        | FAIT   |
| Regroupement par nom d'offre   | FAIT   |
| Edition du nom d'offre         | FAIT   |
| Edition inline des offres      | FAIT   |
| Suppression de puissance       | FAIT   |
| Ajout de puissance             | FAIT   |
| Creation nouveau groupe        | FAIT   |
| Recapitulatif avant soumission | FAIT   |
| Soumission des modifications   | FAIT   |
| Creation nouveau fournisseur   | FAIT   |
| Suppression de fournisseur     | FAIT   |
| Ajout nouvelle offre           | FAIT   |
| Gestion date par offre         | FAIT   |
| Toggle historique des tarifs   | FAIT   |
| Duplication des tarifs         | FAIT   |
| Warning perte de modifications | FAIT   |
| Mode IA (import JSON)          | FAIT   |

## Details implementation

### Mode lecture/edition (FAIT)

- **Mode lecture** (par defaut) : Affichage simple des offres en lecture seule
- **Mode edition** : Permet de modifier les tarifs, supprimer et ajouter des puissances
- Bouton "Proposer des modifications" en haut a droite pour passer en mode edition
- Bouton "Mode lecture" pour revenir au mode lecture (reset toutes les modifications)
- Encadre d'information en mode edition rappelant :
  - Selectionner un fournisseur et un type d'offre
  - Chaque soumission concerne un seul fournisseur/type a la fois

**UI :**

- Bouton mode lecture : `bg-gray-100 dark:bg-gray-700`
- Bouton mode edition : `bg-primary-600 text-white`
- Encadre info : `bg-blue-50 dark:bg-blue-900/20 border-blue-200`

### Filtre par fournisseur (FAIT)

- Boutons pour selectionner un fournisseur
- EDF affiche en premier par defaut
- Compteur d'offres par fournisseur

### Filtre par type d'offre (FAIT)

- Boutons dynamiques selon le fournisseur selectionne
- Types supportes : BASE, HC_HP, TEMPO, EJP, ZEN_FLEX, ZEN_WEEK_END, SEASONAL
- Reset automatique quand on change de fournisseur

### Regroupement par nom d'offre (FAIT)

Les offres sont regroupees par nom "clean" (sans la puissance et le type d'offre).

**Exemple :**
Pour Alpiq avec des offres "Stable 6 kVA", "Stable 9 kVA", "Stable 12 kVA", toutes ces offres sont regroupees sous un seul en-tete "Stable".

**Fonctionnement :**

- Extraction du nom "clean" via `getCleanOfferName()` qui retire :
  - La puissance (ex: "6 kVA", "9kVA")
  - Le type d'offre (ex: "BASE", "HC_HP", "TEMPO")
  - Les tirets et espaces superflus
- Tri des groupes par ordre alphabetique
- Tri des offres dans chaque groupe par puissance croissante
- Affichage d'un en-tete par groupe avec le nombre de puissances

**UI :**

- En-tete de groupe : bordure basse `border-b border-gray-200`
- Nombre de puissances : `text-xs text-gray-500`

### Edition du nom d'offre (FAIT)

En mode edition, l'en-tete de chaque groupe d'offres devient editable.

**Fonctionnement :**

- En mode lecture : affichage simple du nom du groupe
- En mode edition : champ input text remplace le titre
- Highlight ambre quand le nom est modifie
- Badge "Nom modifie" affiche a cote du champ

**State :**

```typescript
const [editedOfferNames, setEditedOfferNames] = useState<
  Record<string, string>
>({});
```

**UI :**

- Input en mode edition : `border-2 rounded-lg` avec focus ring
- Bordure ambre si modifie : `border-amber-400 dark:border-amber-600`
- Badge : `text-xs text-amber-600 bg-amber-100`

**Note :** Cette fonctionnalite permet de proposer un renommage du nom commercial de l'offre (ex: "Stable" → "Fixe Vert").

### Creation nouveau groupe (FAIT)

Permet de proposer la creation d'un nouveau groupe d'offres (nouveau nom commercial) pour un fournisseur/type d'offre existant.

**Exemple :**
Pour Alpiq qui a deja "Stable", on peut proposer un nouveau groupe "Vert Fixe" avec ses propres puissances et tarifs.

**Fonctionnement :**

- Bouton "Creer un nouveau groupe d'offres" en bas de la liste (fond bleu)
- Clic cree un nouveau groupe avec un champ nom et une puissance vide
- Possibilite d'ajouter plusieurs puissances a chaque groupe
- Possibilite de creer plusieurs groupes en une seule soumission
- Bouton X pour supprimer un groupe entier

**Formulaire par groupe :**

1. Champ texte pour le nom du groupe (ex: "Vert Fixe", "Eco Plus")
2. Liste des puissances avec tarifs selon le type d'offre
3. Bouton pour ajouter une puissance au groupe
4. Bouton X pour supprimer le groupe

**State :**

```typescript
const [newGroups, setNewGroups] = useState<
  Array<{
    name: string;
    powers: Array<{
      power: number;
      fields: Record<string, string>;
    }>;
  }>
>([]);
```

**UI :**

- Conteneur groupe : `bg-green-50 border-2 border-dashed border-green-400`
- En-tete : bordure basse `border-green-300`
- Badge : `text-xs text-green-600 bg-green-100` "Nouveau groupe"
- Bouton creer : `bg-blue-50 border-dashed border-blue-300` avec icones `Package` + `Plus`

**Soumission :**

- Type de contribution : `NEW_OFFER`
- Une contribution par puissance dans le groupe
- `existing_provider_id` : ID du fournisseur selectionne
- `offer_name` : `{nom_groupe} - {puissance} kVA`
- Description : "Creation d'un nouveau groupe d'offres..."

**Recap :**

Dans le recapitulatif, les nouveaux groupes sont affiches dans une section bleue avec :

- Le nom du groupe
- La liste des puissances avec leurs tarifs

### Edition inline des offres (FAIT)

- Champs input type="number" avec step="0.0001"
- Highlight jaune/ambre quand une valeur est modifiee
- Badge "Modifie" sur l'offre
- Champs selon le type d'offre :
  - BASE : Abonnement, Prix Base
  - HC_HP : Abonnement, HC, HP
  - TEMPO : Abonnement, Bleu HC/HP, Blanc HC/HP, Rouge HC/HP
  - EJP : Abonnement, Normal, Pointe
  - ZEN_FLEX : Abonnement, Eco HC/HP, Sobriete HC/HP
  - ZEN_WEEK_END : Abonnement, HC, HP, Week-end HC/HP
  - SEASONAL : Abonnement, Hiver HC/HP, Ete HC/HP

### Suppression de puissance (FAIT)

Permet de proposer la suppression d'une puissance existante pour un fournisseur/type d'offre.

- Icone corbeille rouge sur chaque ligne d'offre
- Clic sur la corbeille marque la puissance pour suppression
- Ligne devient rouge avec opacite reduite et texte barre
- Badge "A supprimer" affiche sur la ligne
- Icone annulation (Undo) pour annuler la suppression
- Reset automatique quand on change de fournisseur ou type d'offre

**UI :**

- Bouton corbeille : `text-red-500 dark:text-red-400`
- Ligne marquee : `border-red-400 bg-red-50 opacity-60`
- Badge : `text-red-600 bg-red-100`

**Soumission :**

- Type de contribution : `UPDATE_OFFER`
- Nom de l'offre prefixe avec `[SUPPRESSION]`
- Description : "Demande de suppression de la puissance X kVA pour Fournisseur (Type)"

**Backend (approbation) :**

Quand l'admin approuve une contribution de suppression :

1. Le backend detecte le prefixe `[SUPPRESSION]` dans `offer_name`
2. Recherche l'offre par `provider_id`, `offer_type` et `power_kva`
3. Supprime l'offre de la base de donnees

### Ajout de puissance (FAIT)

Permet de proposer l'ajout de plusieurs nouvelles puissances pour un fournisseur/type d'offre existant.

**Fonctionnement :**

- Bouton "Ajouter une puissance" en bas de la liste des offres
- Chaque clic ajoute une nouvelle ligne verte au-dessus du bouton
- Possibilite d'ajouter plusieurs puissances en une seule soumission
- Chaque ligne contient :
  - Champ de saisie pour la puissance (kVA) - input number
  - Champs de tarification selon le type d'offre
  - Bouton X pour supprimer cette ligne
- Badge "Nouveau" sur chaque ligne ajoutee
- Reset automatique quand on change de fournisseur ou type d'offre

**Champs de tarification selon le type d'offre :**

- BASE : Abonnement (€/mois), Base (€/kWh)
- HC_HP : Abonnement (€/mois), HC (€/kWh), HP (€/kWh)
- TEMPO : Abonnement uniquement (tarifs specifiques apres validation)
- Autres types : Abonnement uniquement (tarifs specifiques apres validation)

**UI :**

- Conteneur : `bg-green-50 dark:bg-green-900/20`
- Bordure : `border-dashed border-green-300` (vide) ou `border-green-400` (avec donnees)
- Icone + : `text-green-600 dark:text-green-400`
- Champs : bordure verte `border-green-300 dark:border-green-600`

**Soumission :**

- Type de contribution : `NEW_OFFER`
- `existing_provider_id` : ID du fournisseur selectionne
- `power_kva` : puissance saisie
- `pricing_data` : tarifs saisis (subscription_price, base_price, hc_price, hp_price)
- Description : "Ajout de la puissance X kVA pour Fournisseur (Type)"

### Recapitulatif avant soumission (FAIT)

- Section recapitulative affichee quand des modifications existent
- Affiche les modifications de tarifs avec ancienne/nouvelle valeur
- Affiche les modifications de puissances dans une section dediee :
  - Suppressions en rouge avec icone corbeille
  - Ajouts en vert avec icone + et details des tarifs saisis (supporte plusieurs ajouts)
- Affiche les nouveaux groupes d'offres dans une section bleue
- Champ lien vers la fiche tarifaire officielle :
  - Obligatoire pour les utilisateurs standards
  - Optionnel pour les admins/moderateurs
- Boutons "Annuler les modifications" et "Envoyer les contributions"

**Recap ajout de puissance :**

Le recapitulatif affiche les informations completes :

- Puissance en kVA
- Abonnement en €/mois (si renseigne)
- Tarif Base en €/kWh (si renseigne)
- Tarif HC en €/kWh (si renseigne, couleur bleue)
- Tarif HP en €/kWh (si renseigne, couleur rouge)

### Soumission des modifications (FAIT)

- Types de contribution :
  - `UPDATE_OFFER` : modification de tarifs existants ou demande de suppression
  - `NEW_OFFER` : ajout d'une nouvelle puissance (une contribution par puissance ajoutee)
- Toast de succes/erreur apres soumission
- Invalidation du cache `my-contributions`
- Reset des modifications apres succes (editedOffers, priceSheetUrl, powersToRemove, newPowersData, newGroups)

## State management

```typescript
// Mode lecture (false) ou edition (true)
const [isEditMode, setIsEditMode] = useState(false);

// Editions de tarifs existants
const [editedOffers, setEditedOffers] = useState<
  Record<string, Record<string, string>>
>({});

// Puissances a supprimer
const [powersToRemove, setPowersToRemove] = useState<number[]>([]);

// Nouvelles puissances a ajouter avec leurs tarifs (supporte plusieurs ajouts)
const [newPowersData, setNewPowersData] = useState<
  Array<{
    power: number;
    fields: Record<string, string>;
  }>
>([]);

// URL de la fiche tarifaire (obligatoire sauf admin/moderateur)
const [priceSheetUrl, setPriceSheetUrl] = useState("");

// Creation nouveau fournisseur (formulaire inline)
const [isAddingProvider, setIsAddingProvider] = useState(false);
const [newProviderName, setNewProviderName] = useState("");
const [newProviderOfferType, setNewProviderOfferType] = useState("");

// Fournisseurs a supprimer
const [providersToRemove, setProvidersToRemove] = useState<string[]>([]);

// Ajout nouvelle offre a un fournisseur existant
const [isAddingOffer, setIsAddingOffer] = useState(false);
const [newOfferType, setNewOfferType] = useState("");

// Edition des noms d'offres (cle = nom original clean, valeur = nouveau nom)
const [editedOfferNames, setEditedOfferNames] = useState<
  Record<string, string>
>({});
```

### Computed values (useMemo)

```typescript
// Regroupement des offres par nom "clean"
const groupedOffers = useMemo(() => {
  const groups: Record<string, typeof providerOffers> = {};
  for (const offer of providerOffers) {
    const cleanName = getCleanOfferName(offer.name);
    if (!groups[cleanName]) groups[cleanName] = [];
    groups[cleanName].push(offer);
  }
  // Tri par puissance dans chaque groupe
  for (const groupName of Object.keys(groups)) {
    groups[groupName].sort((a, b) => powerA - powerB);
  }
  return groups;
}, [providerOffers]);

// Liste des noms de groupes tries alphabetiquement
const groupNames = useMemo(() => {
  return Object.keys(groupedOffers).sort((a, b) => a.localeCompare(b));
}, [groupedOffers]);
```

## API utilisee

- `energyApi.getProviders()` : liste des fournisseurs
- `energyApi.getOffers()` : liste des offres
- `energyApi.submitContribution()` : soumission d'une contribution

### Creation d'un nouveau fournisseur (FAIT)

Permet de proposer l'ajout d'un nouveau fournisseur d'energie directement depuis l'onglet "Toutes les offres".

**Fonctionnement :**

- Bouton `+` pleine largeur en bas de la liste des fournisseurs (visible uniquement en mode edition)
- Style bordure pointillee pour indiquer une action d'ajout
- Clic transforme le bouton en formulaire inline (pas de modal)

**Formulaire inline :**

1. Champ texte pour le nom du fournisseur (obligatoire)
2. Dropdown pour selectionner le type d'offre parmi tous les types existants
3. Section d'ajout de puissances (meme interface que l'ajout pour fournisseurs existants)
4. Bouton X pour annuler et revenir au bouton `+`

**Comportement :**

- Quand on clique sur `+`, toutes les puissances existantes se vident
- On peut ajouter une ou plusieurs puissances avec leurs tarifs
- Les types d'offres disponibles sont extraits de toutes les offres existantes

**UI :**

- Bouton : `border-dashed border-primary-300` avec icone `Plus`, pleine largeur
- Formulaire : fond vert clair `bg-green-50 dark:bg-green-900/20`
- Champ nom : bordure verte `border-green-300`
- Dropdown type : meme style que les autres selects

**Soumission :**

- Type de contribution : `NEW_PROVIDER`
- Inclut le nom du fournisseur, type d'offre, et variantes de puissance
- Invalide les caches `my-contributions` et `energy-providers`
- Toast de succes/erreur
- Reset du formulaire apres succes

### Suppression de fournisseur (FAIT)

Permet de proposer la suppression d'un fournisseur existant.

**Fonctionnement :**

- En mode edition, survol d'un bouton fournisseur affiche une icone corbeille
- Clic sur la corbeille marque le fournisseur pour suppression
- Le bouton devient rouge avec texte barre
- Badge "A supprimer" affiche sur le bouton
- Clic sur l'icone Undo annule la suppression

**UI :**

- Icone corbeille : `text-red-400` au survol
- Bouton marque : `bg-red-100 dark:bg-red-900/30 border-red-400`
- Texte : `line-through text-red-600`
- Badge : `bg-red-100 text-red-600`

**Soumission :**

- Type de contribution : `UPDATE_OFFER`
- Nom de l'offre prefixe avec `[SUPPRESSION_FOURNISSEUR]`
- Description : "Demande de suppression du fournisseur NomFournisseur"

**Backend (approbation) :**

Quand l'admin approuve une contribution de suppression de fournisseur :

1. Le backend detecte le prefixe `[SUPPRESSION_FOURNISSEUR]` dans `offer_name`
2. Recherche le fournisseur par son nom
3. Supprime le fournisseur et toutes ses offres de la base de donnees

### Ajout nouvelle offre (FAIT)

Permet de proposer l'ajout d'un nouveau type d'offre pour un fournisseur existant.

**Fonctionnement :**

- Bouton "Proposer une nouvelle offre" en bas des types d'offres (visible uniquement en mode edition)
- Visible uniquement si le fournisseur n'a pas deja tous les types d'offres
- Clic affiche un formulaire inline avec selection du type d'offre

**Formulaire inline :**

1. Dropdown pour selectionner le type d'offre parmi les types non utilises
2. Section d'ajout de puissances (meme interface que pour les autres modes)
3. Bouton X pour annuler

**Types d'offres predefinis :**

- BASE, HC_HP, TEMPO, EJP, ZEN_FLEX, ZEN_WEEK_END, ZEN_WEEK_END_HP_HC, SEASONAL, BASE_WEEKEND, HC_NUIT_WEEKEND, HC_WEEKEND

**UI :**

- Bouton : `border-dashed border-primary-300` avec icones `Package` + `Plus`
- Formulaire : fond vert clair `bg-green-50 dark:bg-green-900/20`
- Dropdown : bordure verte `border-green-300`

**Soumission :**

- Type de contribution : `NEW_OFFER`
- `existing_provider_id` : ID du fournisseur selectionne
- Inclut le type d'offre et les variantes de puissance
- Invalide les caches `my-contributions`, `energy-providers` et `energy-offers`
- Toast de succes/erreur
- Reset du formulaire apres succes

## Gestion de date par offre (FAIT)

Chaque groupe d'offres (meme nom commercial) possede une date de validite qui permet de gerer l'historique des tarifs.

### Regles metier

| Regle            | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| Identite d'offre | `provider_id` + `offer_type` (meme fournisseur + type = meme offre)          |
| Desactivation    | Automatique a l'approbation d'une nouvelle contribution                      |
| Historique       | Les anciennes offres sont desactivees (`valid_to` defini), jamais supprimees |
| Niveau de date   | Par groupe d'offres (nom commercial), pas par puissance                      |

### Fonctionnement

1. **Formulaire de contribution** : Champ "Date de mise en service" (DatePicker) avec date du jour par defaut
2. **Approbation** : Quand une contribution est approuvee, les offres existantes du meme fournisseur/type sont automatiquement desactivees (`valid_to` = date de la nouvelle offre)
3. **Affichage** : Badge avec la date de validite dans l'en-tete du groupe d'offres (a cote du compteur de puissances)
4. **Toggle historique** : Checkbox pour afficher les tarifs expires dans la liste

### UI

**Badge date** : Affiche a droite de l'en-tete du groupe, style prominent

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Tarif Bleu        9 puissance(s)                 [ Depuis le 01/01/2026 ]│
├──────────────────────────────────────────────────────────────────────────┤
│ 3 kVA    Abo. [11,73] €/mois    Base [0,1952] €/kWh                     │
│ 6 kVA    Abo. [15,47] €/mois    Base [0,1952] €/kWh                     │
│ ...                                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

**Style actif** (offre en vigueur) : fond bleu/primary

```tsx
<span className="text-sm font-medium px-3 py-1 rounded-lg text-primary-700 bg-primary-100 border border-primary-300">
  Depuis le {date}
</span>
```

**Style expire** (offre avec `valid_to`) : fond ambre

```tsx
<span className="text-sm font-medium px-3 py-1 rounded-lg text-amber-700 bg-amber-100 border border-amber-300">
  Expire le {date}
</span>
```

**Toggle historique** : Checkbox dans la section des filtres

```tsx
<label className="flex items-center gap-2 cursor-pointer">
  <input type="checkbox" checked={showHistory} onChange={...} />
  <span>Afficher l'historique des tarifs</span>
</label>
```

### Duplication des tarifs (FAIT)

Permet de copier tous les champs tarifaires (abonnement + prix kWh) d'une ligne de puissance vers la ligne suivante ou toutes les autres lignes du meme groupe.

**Fonctionnement :**

- Icone `CopyDown` (lucide-react) placee a cote de l'icone corbeille dans la colonne d'actions
- Visible uniquement en mode edition
- Clic ouvre un menu contextuel avec deux options :
  - "Dupliquer vers la ligne suivante" : copie vers la puissance immediatement inferieure
  - "Dupliquer vers toutes les lignes" : copie vers toutes les autres puissances du groupe
- Les valeurs dupliquees sont marquees comme "modifiees" (highlight ambre)
- Le bouton "ligne suivante" est desactive sur la derniere ligne du groupe
- Le bouton "toutes les lignes" est desactive si le groupe n'a qu'une seule puissance
- Toast de confirmation apres duplication

**Champs copies selon le type d'offre :**

- Toujours : `subscription_price` (abonnement)
- BASE : `base_price`
- BASE_WEEKEND : `base_price`, `base_price_weekend`
- HC_HP / HC_NUIT_WEEKEND / HC_WEEKEND : `hc_price`, `hp_price`
- TEMPO : `tempo_blue_hc`, `tempo_blue_hp`, `tempo_white_hc`, `tempo_white_hp`, `tempo_red_hc`, `tempo_red_hp`
- EJP : `ejp_normal`, `ejp_peak`
- ZEN_FLEX / SEASONAL : `hc_price_summer`, `hp_price_summer`, `hc_price_winter`, `hp_price_winter`
- ZEN_WEEK_END : `base_price`, `base_price_weekend`
- ZEN_WEEK_END_HP_HC : `hc_price`, `hp_price`, `hc_price_weekend`, `hp_price_weekend`

**UI :**

- Bouton : `text-primary-500 dark:text-primary-400 hover:bg-primary-50`
- Menu dropdown : `bg-white dark:bg-gray-800 border shadow-lg rounded-lg z-50 w-64`
- Fermeture au clic exterieur (useEffect sur document click)

### Warning perte de modifications (FAIT)

Quand l'utilisateur a des modifications en cours (tarifs edites, puissances ajoutees/supprimees, groupes crees, noms renommes) et clique sur une action qui ferait perdre ces modifications, une modale de confirmation s'affiche.

**Actions protegees :**

- Clic "Mode lecture" (quitter le mode edition)
- Clic sur un autre fournisseur
- Clic sur un autre type d'offre

**Fonctionnement :**

- Fonction `confirmOrExecute(action)` verifie `hasAnyModifications`
- Si pas de modification en cours : action executee directement sans confirmation
- Si modifications en cours : affiche une modale avec le nombre de modifications et un avertissement
- 3 boutons dans la modale :
  - **Annuler** : ferme la modale, modifications preservees
  - **Soumettre** : ferme la modale et ouvre le recap de soumission (`showRecapModal`)
  - **Continuer sans soumettre** : l'action est executee (modifications perdues)
- Clic sur le backdrop : equivalent a "Annuler"

**State :**

```typescript
const [confirmDialog, setConfirmDialog] = useState<{
  title: string
  message: string
  onConfirm: () => void
  onSubmit: () => void
} | null>(null)
```

**UI :**

- Style identique a `Admin/Offers.tsx` (pattern inline state)
- Titre : `text-xl font-bold text-orange-600` (type warning)
- Message : inclut le nombre de modifications et un conseil de soumission
- Backdrop : `bg-black/50` ferme la modale au clic
- Bouton "Annuler" : `bg-gray-100 dark:bg-gray-700`
- Bouton "Soumettre" : `bg-primary-600 hover:bg-primary-700 text-white` avec icone `Send`
- Bouton "Continuer sans soumettre" : `bg-orange-600 hover:bg-orange-700 text-white`

### Mode IA - Import JSON (FAIT)

Permet d'importer les tarifs d'un fournisseur via un JSON genere par une IA externe.

**Prerequis :** Mode edition actif + fournisseur selectionne.

**Flux :**

1. L'utilisateur clique sur "Mode IA" dans la barre d'outils
2. Un panneau s'ouvre avec un prompt pre-genere contenant le nom du fournisseur et tous les types d'offres
3. L'utilisateur copie le prompt, le colle dans son IA preferee
4. L'IA genere un JSON multi-offres
5. L'utilisateur colle le JSON et clique "Importer"
6. Les donnees sont validees et injectees dans les champs d'edition

**Format JSON multi-offres :**

```json
{
  "offers": [
    {
      "offer_name": "Nom de l'offre",
      "offer_type": "BASE",
      "valid_from": "2025-02-01",
      "warning": "optionnel",
      "power_variants": [
        {
          "power_kva": 6,
          "subscription_price": 12.34,
          "base_price": 0.2516
        }
      ]
    }
  ]
}
```

**Logique d'import (`importAIJson`) :**

- Nettoyage automatique des blocs markdown (` ```json ... ``` `)
- Validation du type d'offre (doit etre un type connu)
- Pour chaque variante de puissance :
  - Si match par `power_kva` dans les offres existantes du fournisseur : injection dans `editedOffers`
  - Si pas de match : ajout dans `newPowersData`
- Rapport detaille par offre (matched, added, warnings)
- Si import multi-types : passage automatique du filtre en "all"

**States :**

```typescript
const [showAIMode, setShowAIMode] = useState(false)
const [aiJsonInput, setAiJsonInput] = useState('')
const [aiImportResult, setAiImportResult] = useState<{
  success: boolean
  message: string
  details?: Array<{
    offer_type: string
    offer_name: string
    matched: number
    added: number
    warning?: string
  }>
} | null>(null)
```

**UI :**

- Bouton "Mode IA" : `bg-purple-50 dark:bg-purple-900/30 text-purple-700` (inactif) / `bg-purple-600 text-white` (actif)
- Panneau : `border-purple-200 dark:border-purple-700` avec header violet
- Prompt : `<pre>` avec bouton "Copier" en overlay
- Textarea : pour coller le JSON
- Resultat : vert si succes, rouge si erreur, avec details par offre et warnings amber
- Reset automatique au changement de fournisseur

## Flux utilisateur

1. Consulter les offres en mode lecture (par defaut)
2. Cliquer sur "Proposer des modifications" pour passer en mode edition
3. Selectionner un fournisseur (boutons) ou :
   - Cliquer sur le bouton `+` en bas pour ajouter un nouveau fournisseur
   - Survoler un fournisseur et cliquer sur la corbeille pour proposer sa suppression
4. Selectionner un type d'offre (boutons) ou :
   - Cliquer sur "Proposer une nouvelle offre" pour ajouter un nouveau type d'offre au fournisseur
5. Effectuer les modifications souhaitees :
   - **Manuellement** : Modifier les tarifs existants (champs inline)
   - **Duplication** : Dupliquer les tarifs d'une ligne vers la suivante ou toutes les lignes
   - **Mode IA** : Cliquer "Mode IA", copier le prompt, coller le JSON genere par l'IA
   - Marquer des puissances pour suppression (icone corbeille)
   - Ajouter une ou plusieurs puissances (bouton "Ajouter une puissance")
6. Renseigner le lien vers la fiche tarifaire officielle (optionnel pour admin/moderateur)
7. Cliquer sur "Envoyer les contributions"
8. Les contributions sont soumises et apparaissent dans "Mes contributions"
