---
name: new-offers
id: new-offers
path: /contribute/new
description: Onglet nouvelle contribution
mode_client: false
mode_server: true
menu: Contribuer
tab: Nouvelle contribution
---

# Nouvelle contribution

Fichier : `apps/web/src/pages/Contribute/components/tabs/NewContribution.tsx`

## Features

| Feature                          | Statut |
| -------------------------------- | ------ |
| Formulaire nouvelle contribution | FAIT   |
| Selection type contribution      | FAIT   |
| Selection fournisseur existant   | FAIT   |
| Creation nouveau fournisseur     | FAIT   |
| Variantes de puissance           | FAIT   |
| Import JSON batch                | FAIT   |
| Mode edition                     | FAIT   |
| Documentation obligatoire        | FAIT   |
| Gestion multi-périodes           | FAIT   |

## Details implementation

### Formulaire nouvelle contribution (FAIT)

- Card avec titre dynamique (creation/edition)
- Bouton toggle "Import JSON" / "Formulaire"
- Validation avant soumission (au moins 1 variante)
- Boutons "Reinitialiser" et "Soumettre"

### Selection type contribution (FAIT)

- Radio buttons : `NEW_OFFER` ou `NEW_PROVIDER`
- `NEW_OFFER` : fournisseur existant (select)
- `NEW_PROVIDER` : nouveau fournisseur (inputs nom + site web)

### Selection fournisseur existant (FAIT)

- Select avec liste des fournisseurs depuis `energyApi.getProviders()`
- Affiche uniquement si type = `NEW_OFFER`
- Champ obligatoire

### Creation nouveau fournisseur (FAIT)

- Affiche uniquement si type = `NEW_PROVIDER`
- Champs : Nom (obligatoire) + Site web (optionnel)
- Grid 2 colonnes responsive

### Variantes de puissance (FAIT)

- Composant `PowerVariantForm` pour ajouter des variantes
- Liste des variantes ajoutees avec bouton supprimer
- Affichage compact des prix selon le type d'offre :
  - BASE : prix base
  - HC_HP : prix HC/HP
  - TEMPO : prix Bleu/Blanc/Rouge HC/HP
  - EJP : prix Normal/Pointe
- Warning "PRIX TTC UNIQUEMENT" visible
- Validation : au moins 1 variante requise

### Import JSON batch (FAIT)

- Toggle pour afficher/masquer la section
- Textarea pour coller le JSON
- Support d'un objet unique ou tableau d'offres
- Tri automatique par `valid_from` (les anciennes offres sont créées en premier)
- Barre de progression pendant l'import
- Affichage des erreurs par offre
- Invalidation cache apres import
- Prompt AI explicatif avec exemple de format

**Documentation complète** : Voir `exemple-import-json.md` pour des exemples détaillés

### Mode edition (FAIT)

- Detecte `editingContributionId` via props
- Titre change en "Modifier la contribution"
- Bouton "Annuler l'edition" visible
- Mutation `updateContribution` au lieu de `submitContribution`
- Reset du formulaire apres succes

### Documentation obligatoire (FAIT)

- Section separee "Documentation"
- Champ obligatoire : Lien fiche des prix (URL)
- Champ optionnel : Screenshot ou PDF (URL)
- Texte explicatif pour chaque champ

### Gestion multi-periodes (FAIT)

**Composant** : `ValidityPeriodManager.tsx`

**Problème résolu** : Quand une offre a connu plusieurs grilles tarifaires dans le temps (ex: tarifs 2024, puis nouveaux tarifs 2025), il fallait créer manuellement plusieurs contributions. Maintenant, le système permet d'ajouter plusieurs périodes de validité et crée automatiquement une contribution par période.

**Fonctionnalités** :

- Ajout/suppression de périodes de validité
- Détection automatique des chevauchements de périodes (avec alerte visuelle)
- Validation : périodes ne doivent pas se chevaucher
- Badge "Offre active" pour les périodes sans date de fin
- Une contribution est créée par période lors de la soumission
- Mode édition : une seule période autorisée (modification de contribution existante)

**Validation** :

- Au moins une période requise
- Pas de chevauchement autorisé
- Date de début obligatoire pour chaque période
- Date de fin optionnelle (vide = offre active)

**Feedback utilisateur** :

- Compteur de périodes configurées
- Alerte si chevauchement détecté
- Message explicatif sur la création multiple de contributions
- Barre de progression lors de la soumission multiple
- Rapport détaillé des succès/échecs par période

## Types d'offres supportes

| Type            | Description                     |
| --------------- | ------------------------------- |
| BASE            | Tarif unique                    |
| BASE_WEEKEND    | Tarif unique + week-end reduit  |
| HC_HP           | Heures Creuses / Heures Pleines |
| HC_NUIT_WEEKEND | HC Nuit & Week-end (23h-6h)     |
| HC_WEEKEND      | HC PDL + week-end               |
| SEASONAL        | Tarifs saisonniers hiver/ete    |
| ZEN_FLEX        | Eco + Sobriete                  |
| TEMPO           | Bleu/Blanc/Rouge HC/HP          |
| EJP             | Normal + Pointe                 |

## API utilisee

- `energyApi.getProviders()` : Liste des fournisseurs
- `energyApi.submitContribution(data)` : Creation contribution
- `energyApi.updateContribution(id, data)` : Mise a jour contribution

## Composants utilises

- `PowerVariantForm` : Formulaire ajout variante de puissance
- `ValidityPeriodManager` : Gestion multi-periodes de validite
- `SingleDatePicker` : Selecteur de date individuel (utilise par ValidityPeriodManager)
- `toast` : Notifications succes/erreur
- `formatPrice` : Formatage des prix en centimes

## Props

| Prop                       | Type                   | Description                       |
| -------------------------- | ---------------------- | --------------------------------- |
| `editingContributionId`    | `string \| null`       | ID contribution en edition        |
| `setEditingContributionId` | `(id) => void`         | Setter pour l'ID d'edition        |
| `formState`                | `object`               | Etat du formulaire (lifted state) |
| `onFormStateChange`        | `(key, value) => void` | Callback modification formulaire  |
