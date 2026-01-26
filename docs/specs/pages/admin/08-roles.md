---
name: admin_roles
id: roles
path: /admin/roles
description: Gestion des roles et permissions RBAC
mode_client: false
mode_server: true
menu: Administration
subMenu: Roles
tab: Roles
---

# Gestion des rôles

Fichier : `apps/web/src/pages/Admin/Roles.tsx`

## Features

| Feature              | Statut |
| -------------------- | ------ |
| Liste des roles      | FAIT   |
| Creation de role     | FAIT   |
| Modification de role | FAIT   |
| Gestion permissions  | FAIT   |
| Attribution de roles | FAIT   |
| Suppression de role  | FAIT   |

## Details implementation

### Liste des roles (FAIT)

Tableau avec colonnes :

- Nom du role
- Nom d'affichage
- Description
- Nombre d'utilisateurs
- Nombre de permissions
- Type (systeme/personnalise)
- Actions

### Creation de role (FAIT)

Formulaire avec :

- Nom technique (identifier unique)
- Nom d'affichage
- Description
- Selection des permissions
- Validation noms uniques

### Modification de role (FAIT)

- Edition nom d'affichage
- Modification description
- Ajout/retrait permissions
- Apercu utilisateurs affectes
- Roles systeme (admin, user) non modifiables

### Gestion des permissions (FAIT)

Liste par categorie :

- **users** : Gestion utilisateurs
- **pdl** : Gestion PDL
- **offers** : Gestion offres
- **tempo** : Gestion TEMPO
- **ecowatt** : Gestion EcoWatt
- **contributions** : Gestion contributions
- **logs** : Consultation logs
- **admin** : Administration systeme

Actions par permission : view, create, update, delete, manage

### Roles predefinis

| Role        | Permissions                                       |
| ----------- | ------------------------------------------------- |
| admin       | Toutes les permissions (\*)                       |
| user        | pdl:\*, consumption:view, offers:view, tempo:view |
| contributor | user + contributions:create, contributions:view   |
| moderator   | contributor + contributions:manage, offers:create |

## Permissions requises

- **Role** : Administrateur
- **Permission** : `roles:manage`

## Technologies

- React avec TypeScript
- React Query pour mutations et cache
- Tailwind CSS + dark mode

## API utilisee

- `GET /admin/roles` : Liste des roles
- `POST /admin/roles` : Creer un role
- `PUT /admin/roles/{id}` : Modifier un role
- `DELETE /admin/roles/{id}` : Supprimer un role
- `GET /admin/permissions` : Liste des permissions

## Notes

- Systeme RBAC au coeur de la securite
- Roles systeme non supprimables
- Chaque utilisateur a exactement un role
- Permissions verifiees cote backend
- Modifications immediates
