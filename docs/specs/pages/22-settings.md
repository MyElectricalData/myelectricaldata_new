---
id: settings
---
# Page Paramètres

**Route:** `/settings`

## Description

Page permettant aux utilisateurs de **gérer leurs paramètres de compte** et leurs préférences.

**Important:** Crée les différents blocs dans l'ordre suivant.

## Fonctionnalités principales (dans l'ordre d'affichage)

### 1. Statistiques d'utilisation de l'API

- Nombre d'appels avec cache (limit + barre de progression)
- Nombre d'appels sans cache (limit + barre de progression)
- Compteurs quotidiens réinitialisés à minuit UTC
- Affichage de la date actuelle des compteurs
- Rafraîchissement automatique toutes les 30 secondes

### 2. Informations du compte

- Affichage de l'email
- Affichage de l'ID utilisateur (UID)
- Statut du compte (actif/inactif)
- Date de création du compte

### 3. Identifiants API (Client Credentials)

- Affichage du client_id avec bouton de copie
- Gestion du client_secret avec un bouton pour le régénérer
- ⚠️ Le client_secret n'est jamais stocké ni affiché. Vous l'avez reçu lors de la création de votre compte.
- Avertissement : régénérer invalide l'ancien secret et supprime le cache

### 4. Modification du mot de passe

- Formulaire de changement de mot de passe
- Validation de l'ancien mot de passe
- Confirmation du nouveau mot de passe
- Messages de succès/erreur

### 5. Thème

- Sélection du thème (clair/sombre/système)
- Application immédiate du thème choisi

### 6. Token d'API (JWT)

- Bouton pour copier le token de session actuel
- Permet d'appeler les API directement (pour développeurs)
- Avertissement sur la durée de vie limitée du token
- Message de sécurité (ne pas partager le token)

### 7. Déconnexion

- Bouton de déconnexion

### 8. Gestion du compte (Zone dangereuse)

- Option de suppression du compte (avec confirmation)

## Technologies utilisées

- React avec TypeScript
- React Query pour les mutations
- Tailwind CSS pour le style
- Support du mode sombre
- react-hot-toast pour les notifications

## Fichiers liés

- **Frontend** : `apps/web/src/pages/Settings.tsx`
- **API** : `apps/web/src/api/accounts.ts`
- **Hooks** : `apps/web/src/hooks/useAuth.ts`
- **Types** : `apps/web/src/types/api.ts`
- **Backend** : `apps/api/src/routers/accounts.py`

## Notes importantes

- Les modifications de mot de passe nécessitent l'ancien mot de passe pour plus de sécurité
- Le token d'API a une durée de vie limitée (généralement 24h) et ne doit jamais être partagé
- La suppression du compte est irréversible et nécessite une confirmation
- Le thème est persistant et stocké dans le localStorage
