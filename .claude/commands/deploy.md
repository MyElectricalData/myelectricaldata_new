---
description: Create Dockerfiles and docker-compose
allowed-tools: Bash(docker:*), Bash(cat:*), Bash(tee:*)
---

# Objectif

Fournir un environnement conteneurise complet pour lancer la plateforme (API + Front) en local via un simple `docker compose up`, tout en preparant la base pour un futur deploiement Kubernetes.

## 1. `apps/api/Dockerfile`

Multi-stage FastAPI (ou backend Python) :

- **Stage build** : image `python:3.12-slim`, installation dependances via `poetry` ou `pip`, compilation assets/eventuels scripts.
- **Stage runtime** : base minimale (`python:3.12-slim`), copie du venv/app, creation utilisateur non-root.
- Exposer le port `8000`.
- Commande d'entree : `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Healthcheck Docker : `CMD curl -fsS http://localhost:8000/healthz || exit 1`.

## 2. `apps/web/Dockerfile`

Multi-stage Vite/React :

- **Stage build** : image `node:20-alpine`, installation deps (`npm ci`), build `npm run build`.
- **Stage runtime** : `nginx:alpine`, copie du dossier `dist` et configuration nginx SPA.
- Exposer le port `4173` (custom nginx) ou `80` selon choix.
- Healthcheck Docker : `CMD curl -fsS http://localhost:4173/ || exit 1`.
- Inclure un `nginx.conf` pour la redirection SPA (`try_files $uri /index.html`).

## 3. `docker-compose.yml`

Services attendus :

- **api**
  - Build `./apps/api` (Dockerfile ci-dessus)
  - Ports : `8000:8000`
  - Dependances : `redis`, `postgres`
  - Healthcheck utilisant `/healthz`
  - Variables d'environnement depuis `.env`
- **web**
  - Build `./apps/web`
  - Ports : `3000:4173`
  - Depend de `api` (condition `service_healthy`)
- **redis**
  - Image officielle `redis:7-alpine`
  - Volumes pour la persistence optionnelle
- **postgres**
  - Image `postgres:16-alpine`
  - Variables d'environnement (POSTGRES_DB, USER, PASSWORD)
  - Volume de donnees

Configuration generale :

- `env_file: .env`
- Reseau interne par defaut
- Restart policy : `unless-stopped`
- Monter un volume `./logs` si besoin pour la collecte locale

## 4. `.env.example`

Inclure les variables essentielles :

```bash
# API Gateway / Enedis
ENEDIS_CLIENT_ID=
ENEDIS_CLIENT_SECRET=
ENEDIS_BASE_URL=https://gw.ext.prod-sandbox.api.enedis.fr

# Auth / Comptes
JWT_SECRET=
JWT_EXPIRE_SECONDS=3600

# Cache
CACHE_TTL_SECONDS=86400
REDIS_URL=redis://redis:6379/0

# Base de donnees
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=myelectricaldata
POSTGRES_USER=myelectricaldata
POSTGRES_PASSWORD=change-me

# Application
APP_ENV=local
LOG_LEVEL=info
```

## 5. README

Ajouter une section "Docker / Local" :

1. `cp .env.example .env`
2. `docker compose build`
3. `docker compose up`
4. API disponible sur `http://localhost:8000`, Front sur `http://localhost:3000`
5. Arreter : `docker compose down`
6. Logs : `docker compose logs -f`

Mentionner aussi :

- Commandes utiles (`docker compose exec api alembic upgrade head`, etc.)
- Prerequis (Docker >= 24, Docker Compose Plugin)

## 6. Ouverture Kubernetes

Preparer un dossier `deploy/k8s/` contenant :

- Chart Helm ou manifests (`Deployment`, `Service`, `Ingress`, `ConfigMap`, `Secret`)
- Documentation rapide pour passer du compose au cluster

Garder toutes les configurations coherentes avec les specs fonctionnelles (`@docs/features-spec/*`).
