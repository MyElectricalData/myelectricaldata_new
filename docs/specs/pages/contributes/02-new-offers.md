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
- Barre de progression pendant l'import
- Affichage des erreurs par offre
- Invalidation cache apres import

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
- `valid_from` auto-rempli avec date du jour

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
- `toast` : Notifications succes/erreur
- `formatPrice` : Formatage des prix en centimes

## Props

| Prop                       | Type                   | Description                       |
| -------------------------- | ---------------------- | --------------------------------- |
| `editingContributionId`    | `string \| null`       | ID contribution en edition        |
| `setEditingContributionId` | `(id) => void`         | Setter pour l'ID d'edition        |
| `formState`                | `object`               | Etat du formulaire (lifted state) |
| `onFormStateChange`        | `(key, value) => void` | Callback modification formulaire  |
