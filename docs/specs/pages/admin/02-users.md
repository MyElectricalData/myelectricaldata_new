---
name: admin_users
id: users
path: /admin/users
description: Gestion des utilisateurs de la plateforme
mode_client: false
mode_server: true
menu: Administration
subMenu: Utilisateurs
tab: Utilisateurs
---

# Utilisateurs

Fichier : `apps/web/src/pages/Admin/Users.tsx`

## Features

| Feature                | Statut |
| ---------------------- | ------ |
| Liste des utilisateurs | FAIT   |
| Recherche et filtrage  | FAIT   |
| Actions utilisateurs   | FAIT   |
| Creation utilisateur   | FAIT   |
| Statistiques           | FAIT   |

## Details implementation

### Liste des utilisateurs (FAIT)

Tableau avec colonnes :

- Email
- Client ID
- Role
- Statut (actif/inactif)
- Mode debug (oui/non)
- Date de creation
- Actions

### Recherche et filtrage (FAIT)

- Barre de recherche par email
- Filtre par role (admin, user, etc.)
- Filtre par statut (actif/inactif)
- Tri par colonne

### Actions sur les utilisateurs (FAIT)

- Activer/Desactiver un utilisateur
- Modifier le role
- Activer/Desactiver mode debug
- Reinitialiser le mot de passe
- Supprimer (avec confirmation)

### Creation d'utilisateur (FAIT)

- Formulaire de creation rapide
- Attribution d'un role
- Generation automatique mot de passe temporaire

### Statistiques (FAIT)

- Nombre total d'utilisateurs
- Utilisateurs actifs
- Administrateurs
- Crees ce mois

## Permissions requises

- **Role** : Administrateur
- **Permission** : `users:manage`

## Technologies

- React avec TypeScript
- React Query pour mutations et cache
- Tailwind CSS + dark mode

## API utilisee

- `GET /admin/users` : Liste des utilisateurs
- `POST /admin/users` : Creer un utilisateur
- `PUT /admin/users/{id}` : Modifier un utilisateur
- `DELETE /admin/users/{id}` : Supprimer un utilisateur
- `POST /admin/users/{id}/reset-password` : Reset mot de passe

## Notes

- La desactivation ne supprime pas les donnees
- Les modifications sont immediates
- Les actions sensibles necessitent confirmation
