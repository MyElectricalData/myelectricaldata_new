---
name: admin_logs
id: logs
path: /admin/logs
description: Consultation des logs systeme pour monitoring et debug
mode_client: false
mode_server: true
menu: Administration
subMenu: Logs
tab: Logs
---

# Logs

Fichier : `apps/web/src/pages/Admin/Logs.tsx`

## Features

| Feature            | Statut |
| ------------------ | ------ |
| Affichage des logs | FAIT   |
| Panneau de filtres | FAIT   |
| Tri et navigation  | FAIT   |
| Code couleur       | FAIT   |
| Actions et refresh | FAIT   |
| Details d'un log   | FAIT   |

## Details implementation

### Affichage des logs (FAIT)

Liste temps reel avec colonnes configurables :

- Timestamp
- Niveau (DEBUG, INFO, WARNING, ERROR)
- Module/Source
- Message
- Prefixe PDL : `[XXXXXXXXXXXXXX]` pour logs lies a un PDL
- Expansion pour details complets (pathname, line number, exception)

### Panneau de filtres intelligent (FAIT)

**Header reduit interactif** :

- Champ recherche (Ctrl+K) pleine largeur
- Boutons filtrage rapide par niveau
- Badge indicateur filtres modules actifs

**Panneau detaille (depliable)** :

- Selection multiple niveaux avec Tous/Aucun
- Filtrage par modules par categories :
  - src, uvicorn, fastapi, sqlalchemy
- Boutons "Seul" et "Tous/Aucun" par categorie
- Affichage en grille (5 colonnes)

**Options** :

- Recherche textuelle tous champs
- Selection colonnes visibles
- Nombre lignes (50, 100, 200, 500, 1000)
- Filtres par defaut : INFO, WARNING, ERROR (DEBUG exclu)
- Sauvegarde auto dans localStorage

### Tri et navigation (FAIT)

- Tri par timestamp (asc/desc)
- Preservation position scroll lors refresh
- Protection erreurs apres unmount
- Gestion timestamps avec pruning auto (max 2x linesCount)
- Scroll fluide avec barre personnalisee

### Code couleur (FAIT)

| Niveau  | Couleur Light   | Couleur Dark    |
| ------- | --------------- | --------------- |
| DEBUG   | `bg-gray-100`   | `bg-gray-200`   |
| INFO    | `bg-blue-100`   | `bg-blue-600`   |
| WARNING | `bg-yellow-100` | `bg-yellow-500` |
| ERROR   | `bg-red-100`    | `bg-red-600`    |

### Actions et rafraichissement (FAIT)

- Rafraichissement manuel avec bouton
- Rafraichissement auto configurable (5s, 10s, 30s, 60s, off)
- Indicateur refresh avec animation
- Bouton "Haut de page"
- Timestamp derniere mise a jour

### Details d'un log (FAIT)

Clic pour afficher :

- Informations etendues : pathname, lineno, funcName
- Stack trace formatee pour exceptions
- Support logs multi-lignes
- **Copie presse-papier** : timestamp, niveau, module, message, JSON complet
- Toast notification confirmation

## Architecture backend

### Stockage et retention

- **Valkey** : une liste par niveau, `logs:{level}`, ligne la plus recente en tete
- **Plafond** : LPUSH + LTRIM + EXPIRE en pipeline ; info 1000, warning et error 5000 (`LOG_MAX_ENTRIES_PER_LEVEL`, `LOG_MAX_ENTRIES_WARNING`, `LOG_MAX_ENTRIES_ERROR`)
- **TTL** : 24 heures, renouvele a chaque ligne du niveau
- **Ecriture** : un thread ecrivain unique, file bornee, une connexion reutilisee
- **Lecture** : LRANGE par niveau puis fusion par horodatage (pas de SCAN) ; `total` = somme des LLEN

### Optimisations

- Timeouts courts (1s)
- Thread ecrivain dedie, `emit` non bloquant (ligne perdue si la file est pleine)
- Filtrage intelligent logs HTTP
- Format JSON compact
- Gestion silencieuse erreurs Redis

### Logging avec identification PDL

- Helper `log_with_pdl(level, pdl, message)`
- `log_if_debug(user, level, message, pdl)` pour logs conditionnels
- Format : `[XXXXXXXXXXXXXX] [TAG] message`

## Permissions requises

- **Role** : Administrateur
- **Permission** : `logs:view`

## Technologies

- React avec TypeScript
- React hooks (useState, useEffect, useRef)
- Axios pour appels API
- Tailwind CSS + dark mode
- Lucide React pour icones
- localStorage pour preferences

## API utilisee

- `GET /admin/logs` : Liste des logs
- Parametres : level, module, search, limit, offset

## Fichiers backend

- Router : `apps/api/src/routers/admin.py`
- Config logging : `apps/api/src/logging_config.py`
- Business logic : `apps/api/src/routers/enedis.py`, `pdl.py`

## Notes

- Logs critiques pour diagnostics production
- Logs sensibles (mots de passe, tokens) masques automatiquement
- Retention : plafond par niveau, 24 heures au plus apres la derniere ligne
- DEBUG genere beaucoup de logs (exclu par defaut)
- Identification PDL pour faciliter debugging
- Refresh preserve position scroll
- Protection fuites memoire avec pruning auto
