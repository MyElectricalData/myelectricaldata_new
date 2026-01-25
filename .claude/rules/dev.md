---
globs:
  - apps/**/*
  - docker-compose*.yml
  - dev/**/*
  - Makefile
---

# Developpement

## Agents specialises

**Utiliser les agents selon le contexte :**

- **Frontend** (`apps/web/`) : Utiliser l'agent `frontend-specialist`
- **Backend** (`apps/api/`) : Utiliser l'agent `backend-specialist`

## Structure Docker Compose

**Ce projet separe production et developpement :**

| Fichier | Usage | Services inclus |
|---------|-------|-----------------|
| `docker-compose.yml` (racine) | **Production Client** | Backend, Frontend uniquement (images GHCR) |
| `docker-compose.server.yml` (racine) | **Production Serveur** | Backend, Frontend uniquement (images GHCR) |
| `dev/docker-compose.yml` | Developpement Client | Backend, Frontend, PostgreSQL, VictoriaMetrics, pgAdmin |
| `dev/docker-compose.server.yml` | Developpement Serveur | Backend, Frontend, PostgreSQL, Valkey, pgAdmin, Docs |

## Modes d'execution

**Ce projet supporte deux modes qui peuvent tourner en parallele. Le mode Client est le defaut.**

| Mode        | Dev Docker Compose             | Prod Docker Compose           | Ports           |
| ----------- | ------------------------------ | ----------------------------- | --------------- |
| **Client**  | `dev/docker-compose.yml`       | `docker-compose.yml`          | 8100 / 8181     |
| **Serveur** | `dev/docker-compose.server.yml`| `docker-compose.server.yml`   | 8000 / 8081     |

### Demarrage par mode (Developpement)

```bash
# Mode Client (defaut)
make up                    # ou docker compose -f dev/docker-compose.yml up -d

# Mode Serveur
make server-up             # ou docker compose -f dev/docker-compose.server.yml up -d
```

### Logs par mode

**En developpement local, les logs Docker sont facilement accessibles :**

```bash
# Mode Client (defaut)
make logs                  # Tous les services
make backend-logs          # Backend uniquement
docker compose -f dev/docker-compose.yml logs -f     # Equivalent

# Mode Serveur
make server-logs
docker compose -f dev/docker-compose.server.yml logs -f
```

**Astuce** : Les logs sont en temps reel grace au flag `-f` (follow). Tres utile pour debugger car les erreurs Python/TypeScript apparaissent instantanement.

## Acces par mode

### Mode Client (defaut)

| Service     | URL                          |
| ----------- | ---------------------------- |
| Frontend    | <http://localhost:8100>      |
| Backend API | <http://localhost:8181>      |
| API Docs    | <http://localhost:8181/docs> |
| pgAdmin     | <http://localhost:5051>      |

### Mode Serveur

| Service     | URL                          |
| ----------- | ---------------------------- |
| Frontend    | <http://localhost:8000>      |
| Backend API | <http://localhost:8081>      |
| API Docs    | <http://localhost:8081/docs> |
| pgAdmin     | <http://localhost:5050>      |

## Auto-reload actif (Developpement)

**Les services de dev sont en auto-reload. NE PAS redemarrer apres modification de code.**

- **Backend** : Uvicorn `--reload` detecte les changements Python
- **Frontend** : Vite HMR recharge instantanement les composants React

**Redemarrage necessaire uniquement si** :

- Modification `.env.api`, `.env.client` ou `.env`
- Ajout dependances (`pyproject.toml`, `package.json`)
- Modification `dev/docker-compose*.yml` ou `Dockerfile`

## Commandes principales

### Mode Client (Makefile - defaut)

```bash
# Demarrage
make dev              # Start dev avec hot-reload
make up               # Start tous les services
make down             # Stop tous les services

# Logs
make logs             # Tous les logs
make backend-logs     # Logs backend uniquement

# Database
make migrate          # Appliquer migrations
make migrate-revision # Generer nouvelle migration
make db-shell         # Shell PostgreSQL

# Backend (apps/api/)
make lint             # ruff + mypy
make test             # pytest avec coverage

# Frontend (apps/web/)
npm run lint          # ESLint
npm run build         # Build production
```

### Mode Serveur (commandes server-*)

```bash
# Demarrage
make server-up        # ou docker compose -f dev/docker-compose.server.yml up -d

# Arret
make server-down

# Logs
make server-logs

# Database
make server-migrate
make server-db-shell

# Rebuild apres modification Dockerfile
make server-rebuild
```

## Validation

**En fin de traitement, toujours verifier les logs Docker pour valider que tout est OK :**

```bash
# Mode Client (defaut)
make backend-logs     # Verifier pas d'erreurs backend

# Mode Serveur
make server-backend-logs

# Verifier les conteneurs actifs
docker ps             # Liste tous les conteneurs
```

**Indicateurs d'erreur a surveiller :**

- `ERROR` ou `CRITICAL` dans les logs Python
- Erreurs TypeScript/ESLint dans les logs frontend
- Codes HTTP 500 dans les requetes API

## Documentation

**En cas de changement de fonctionnement, mettre a jour la documentation :**

| Scope        | Emplacement                  |
| ------------ | ---------------------------- |
| Mode Serveur | `docs/`                      |
| Mode Client  | `docs/local-client/`         |
| Pages UI     | `docs/pages/`                |
| Design       | `docs/design/`               |
| API Enedis   | `docs/enedis-api/`           |
