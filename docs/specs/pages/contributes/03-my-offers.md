---
name: my-offers
id: my-offers
path: /contribute/mine
description: Onglet mes contributions
mode_client: false
mode_server: true
menu: Contribuer
tab: Mes contributions
---

# Mes contributions

Fichier : `apps/web/src/pages/Contribute/components/tabs/MyContributions.tsx`

## Features

| Feature                          | Statut |
| -------------------------------- | ------ |
| Liste des contributions groupees | FAIT   |
| Accordeons par statut            | FAIT   |
| Carte de contribution            | FAIT   |
| Systeme de messagerie            | FAIT   |
| Edition d'une contribution       | FAIT   |
| Suppression d'une contribution   | FAIT   |
| Auto-refresh                     | FAIT   |

## Details implementation

### Liste des contributions groupees (FAIT)

- Contributions groupees par statut : pending, approved, rejected
- Tri par date decroissante dans chaque groupe
- Compteur de contributions par groupe

### Accordeons par statut (FAIT)

- "En attente" (jaune) : deplie par defaut
- "Approuvees" (vert) : plie par defaut
- "Rejetees" (rouge) : plie par defaut
- Icones : Clock, CheckCircle, XCircle

### Carte de contribution (FAIT)

Affiche pour chaque contribution :

- Nom de l'offre + type + puissance
- Fournisseur et date de creation
- Description (tronquee)
- Lien vers la fiche des prix (ExternalLink)
- Tarifs compacts (Abo, Base, HC, HP, Tempo, EJP)
- Commentaire de rejet si rejete

### Systeme de messagerie (FAIT)

- Composant ChatWhatsApp pour les echanges
- Notification "Nouveau" si dernier message de l'admin
- Accordeon "Echanges" avec compteur de messages
- Input de reponse uniquement pour contributions en attente
- Mutation `replyToContribution`
- Auto-deploiement si dernier message de l'admin (non lu)
- Protection anti-perte : impossible de replier si en train d'ecrire
- Auto-scroll vers le dernier message
- Envoi avec Entree (Shift+Entree pour nouvelle ligne)
- Messages differencies visuellement :
  - Admin (Modo) : fond bleu avec icone bouclier
  - Contributeur (Vous) : fond vert avec icone utilisateur
- Horodatage compact (JJ/MM HH:MM)

### Edition d'une contribution (FAIT)

- Bouton "Modifier" pour contributions pending et rejected
- Navigation vers `/contribute/new`
- Pre-remplissage du formulaire via `onEditContribution`
- Toast de confirmation "Mode edition active"

### Suppression d'une contribution (FAIT)

- Bouton "Supprimer" (icone poubelle) pour contributions pending et rejected
- Confirmation inline avant suppression (Annuler / Confirmer)
- Mutation `deleteContribution` avec invalidation du cache
- Toast de succes apres suppression
- Les contributions approuvees ne peuvent pas etre supprimees

### Auto-refresh (FAIT)

- `refetchInterval: 10000` (10 secondes)
- Rafraichit automatiquement pour voir les nouveaux messages

## API utilisee

- `energyApi.getMyContributions()`
- `energyApi.replyToContribution(contributionId, message)`
- `energyApi.deleteContribution(contributionId)`

## Composants utilises

- `ChatWhatsApp` : Affichage des messages style WhatsApp
- `toast` : Notifications
