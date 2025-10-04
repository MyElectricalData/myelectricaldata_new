---
description: Rebuild npm workspaces & restart Docker stack
allowed-tools: Bash(npm:*), Bash(npx:*), Bash(docker:*)
---

# Rebuild & Restart

Utilise cette commande pour refaire les installations npm et relancer l'environnement Docker :

```bash
npm install --prefix apps/web \
  && docker compose down --remove-orphans \
  && docker compose build --no-cache \
  && docker compose up -d --force-recreate
```

## Explications

- `npm install --prefix apps/web` : (re)installe les dépendances du frontend.
- `docker compose down --remove-orphans` : arrête les conteneurs existants et nettoie les services orphelins.
- `docker compose build --no-cache` : reconstruit toutes les images sans utiliser le cache, pour prendre en compte les dernières dépendances.
- `docker compose up -d --force-recreate` : relance les services en détaché en recréant les conteneurs.

Assure-toi d'exécuter cette commande depuis la racine du projet (`/Users/cvalentin/Git/myelectricaldata_new`).
/re
