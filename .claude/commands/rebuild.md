---
description: Rebuild npm workspaces & restart Docker stack
allowed-tools: Bash(npm:*), Bash(npx:*), Bash(docker:*)
---

# Rebuild & Restart

⚠️ **Important** : Utilise `restart` au lieu de `down` pour **préserver les données PostgreSQL** (notamment l'historique TEMPO).

## Rebuild complet (SANS perte de données)

```bash
npm install --prefix apps/web \
  && docker compose build --no-cache \
  && docker compose --profile postgres up -d --force-recreate
```

## Rebuild complet (AVEC suppression des données)

⚠️ **Attention** : Cette commande **supprime toutes les données** (historique TEMPO, utilisateurs, etc.) :

```bash
npm install --prefix apps/web \
  && docker compose down --remove-orphans \
  && docker compose build --no-cache \
  && docker compose --profile postgres up -d
```

## Explications

- `npm install --prefix apps/web` : (re)installe les dépendances du frontend.
- `docker compose build --no-cache` : reconstruit toutes les images sans utiliser le cache.
- `docker compose up -d --force-recreate` : relance les services en recréant les conteneurs **mais garde les volumes**.
- `docker compose down` : **SUPPRIME les conteneurs ET peut supprimer les volumes selon la config**.

## Note sur l'historique TEMPO

L'API RTE ne fournit que ~12 mois d'historique. Si vous faites `docker compose down`, vous perdrez les données et ne pourrez récupérer que les 12 derniers mois en relançant le refresh.

Assure-toi d'exécuter cette commande depuis la racine du projet (`/Users/cvalentin/Git/myelectricaldata_new`).
