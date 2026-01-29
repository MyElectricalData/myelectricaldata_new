---
name: settings
id: settings
path: /settings
description: Gestion des parametres de compte et preferences
mode_client: false
mode_server: true
menu: Parametres
---

# Page Parametres

Page permettant aux utilisateurs de **gérer leurs paramètres de compte** et leurs préférences.

## Features

| Feature                       | Statut |
| ----------------------------- | ------ |
| Statistiques utilisation API  | FAIT   |
| Informations du compte        | FAIT   |
| Identifiants API              | FAIT   |
| Modification mot de passe     | FAIT   |
| Selection theme               | FAIT   |
| Token API (JWT)               | FAIT   |
| Deconnexion                   | FAIT   |
| Suppression compte            | FAIT   |

## Fichiers

| Type    | Fichier                              |
| ------- | ------------------------------------ |
| Page    | `apps/web/src/pages/Settings.tsx`    |
| API     | `apps/web/src/api/accounts.ts`       |
| Hooks   | `apps/web/src/hooks/useAuth.ts`      |
| Backend | `apps/api/src/routers/accounts.py`   |

## Details implementation

**Important:** Crée les différents blocs dans l'ordre suivant.

### Statistiques d'utilisation de l'API (FAIT)

- Nombre d'appels avec cache (limit + barre de progression)
- Nombre d'appels sans cache (limit + barre de progression)
- Compteurs quotidiens réinitialisés à minuit UTC
- Affichage de la date actuelle des compteurs
- Rafraîchissement automatique toutes les 30 secondes

### Informations du compte (FAIT)

- Affichage de l'email
- Affichage de l'ID utilisateur (UID)
- Statut du compte (actif/inactif)
- Date de création du compte

### Identifiants API (FAIT)

- Affichage du client_id avec bouton de copie
- Gestion du client_secret avec un bouton pour le régénérer
- ⚠️ Le client_secret n'est jamais stocké ni affiché. Vous l'avez reçu lors de la création de votre compte.
- Avertissement : régénérer invalide l'ancien secret et supprime le cache

### Modification du mot de passe (FAIT)

- Formulaire de changement de mot de passe
- Validation de l'ancien mot de passe
- Confirmation du nouveau mot de passe
- Messages de succès/erreur

### Theme (FAIT)

- Sélection du thème (clair/sombre/système)
- Application immédiate du thème choisi

### Token d'API (FAIT)

- Bouton pour copier le token de session actuel
- Permet d'appeler les API directement (pour développeurs)
- Avertissement sur la durée de vie limitée du token
- Message de sécurité (ne pas partager le token)

### Deconnexion (FAIT)

- Bouton de déconnexion

### Gestion du compte - Zone dangereuse (FAIT)

- Option de suppression du compte (avec confirmation)

## Notes importantes

- Les modifications de mot de passe nécessitent l'ancien mot de passe pour plus de sécurité
- Le token d'API a une durée de vie limitée (généralement 24h) et ne doit jamais être partagé
- La suppression du compte est irréversible et nécessite une confirmation
- Le thème est persistant et stocké dans le localStorage
